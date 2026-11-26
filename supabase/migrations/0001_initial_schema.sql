-- Sidekick initial data model.
-- Apply with the Supabase CLI or SQL editor after creating a Supabase project.
-- Every user-facing table is isolated with row-level security (RLS).

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$;

revoke all on function public.handle_new_user() from public;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation' check (char_length(title) between 1 and 160),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_id_user_unique unique (id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 20000),
  created_at timestamptz not null default now(),
  constraint messages_conversation_user_fk
    foreign key (conversation_id, user_id)
    references public.conversations(id, user_id)
    on delete cascade
);


create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_id_user_unique unique (id, user_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 4000),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_project_user_fk
    foreign key (project_id, user_id)
    references public.projects(id, user_id)
    on delete cascade
);

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  title text not null check (char_length(title) between 1 and 160),
  content text not null check (char_length(content) between 1 and 4000),
  category text not null default 'other' check (category in ('preference', 'goal', 'project', 'workflow', 'fact', 'other')),
  source text not null default 'user' check (source in ('user', 'conversation', 'document', 'assistant')),
  pinned boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  search_document tsvector generated always as (
    to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || content)
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memories_project_user_fk
    foreign key (project_id, user_id)
    references public.projects(id, user_id)
    on delete cascade
);

create index memories_user_updated_idx on public.memories(user_id, pinned desc, updated_at desc);
create index memories_search_idx on public.memories using gin(search_document);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null check (char_length(action_type) between 1 and 80),
  summary text not null check (char_length(summary) between 1 and 500),
  payload jsonb not null default '{}'::jsonb,
  payload_hash text not null check (char_length(payload_hash) = 64),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'executed', 'failed')),
  expires_at timestamptz,
  decided_at timestamptz,
  executed_at timestamptz,
  execution_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status not in ('approved', 'rejected')) or decided_at is not null)
);

create table public.api_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0)
);

alter table public.api_rate_limits enable row level security;

create or replace function public.consume_chat_rate_limit(
  p_max_requests integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request_count integer;
begin
  if v_user_id is null then
    return false;
  end if;

  if p_max_requests < 1 or p_max_requests > 1000
    or p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'Invalid rate limit parameters';
  end if;

  insert into public.api_rate_limits (user_id, window_started_at, request_count)
  values (v_user_id, now(), 1)
  on conflict (user_id) do update
  set
    window_started_at = case
      when now() >= public.api_rate_limits.window_started_at + make_interval(secs => p_window_seconds)
      then now()
      else public.api_rate_limits.window_started_at
    end,
    request_count = case
      when now() >= public.api_rate_limits.window_started_at + make_interval(secs => p_window_seconds)
      then 1
      else public.api_rate_limits.request_count + 1
    end
  returning request_count into v_request_count;

  return v_request_count <= p_max_requests;
end;
$$;

revoke all on function public.consume_chat_rate_limit(integer, integer) from public;
grant execute on function public.consume_chat_rate_limit(integer, integer) to authenticated;

create table public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 1 and 100),
  resource_type text,
  resource_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index conversations_user_updated_idx on public.conversations(user_id, updated_at desc);
create index messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index projects_user_updated_idx on public.projects(user_id, updated_at desc);
create index tasks_user_status_due_idx on public.tasks(user_id, status, due_at);
create index approvals_user_status_created_idx on public.approvals(user_id, status, created_at desc);
create index audit_logs_user_created_idx on public.audit_logs(user_id, created_at desc);

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger conversations_set_updated_at before update on public.conversations
for each row execute function public.set_updated_at();
create trigger projects_set_updated_at before update on public.projects
for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks
for each row execute function public.set_updated_at();
create trigger memories_set_updated_at before update on public.memories
for each row execute function public.set_updated_at();
create trigger approvals_set_updated_at before update on public.approvals
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.memories enable row level security;
alter table public.approvals enable row level security;
alter table public.audit_logs enable row level security;

create policy "Users can read their profile" on public.profiles
for select to authenticated using (id = (select auth.uid()));
create policy "Users can update their profile" on public.profiles
for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Users manage their conversations" on public.conversations
for all to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users can read their messages" on public.messages
for select to authenticated using (user_id = (select auth.uid()));

create policy "Users can send their own messages" on public.messages
for insert to authenticated with check (
  user_id = (select auth.uid())
  and role = 'user'
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid())
  )
);

create policy "Users manage their projects" on public.projects
for all to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users manage their tasks" on public.tasks
for all to authenticated using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (project_id is null or exists (
    select 1 from public.projects p
    where p.id = project_id and p.user_id = (select auth.uid())
  ))
);

create policy "Users manage their memories" on public.memories
for all to authenticated using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (project_id is null or exists (
    select 1 from public.projects p
    where p.id = project_id and p.user_id = (select auth.uid())
  ))
);

create policy "Users can view their approvals" on public.approvals
for select to authenticated using (user_id = (select auth.uid()));

-- Approval decisions and execution state must be changed by trusted server code,
-- not directly by a browser client.
create policy "Users can view their audit history" on public.audit_logs
for select to authenticated using (user_id = (select auth.uid()));

-- Deliberately no browser INSERT/UPDATE/DELETE policies for audit_logs.
-- The server should write audit events using a protected service-role client.
