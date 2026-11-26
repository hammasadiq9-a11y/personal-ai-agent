-- Sidekick initial data model.
-- Apply with the Supabase CLI or SQL editor after creating a Supabase project.
-- Every user-facing table is isolated with row-level security (RLS).

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation' check (char_length(title) between 1 and 160),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

alter table public.conversations
  add constraint conversations_id_user_unique unique (id, user_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
    on delete set null
);

alter table public.projects
  add constraint projects_id_user_unique unique (id, user_id);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null check (char_length(action_type) between 1 and 80),
  summary text not null check (char_length(summary) between 1 and 500),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'executed', 'failed')),
  expires_at timestamptz,
  decided_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status not in ('approved', 'rejected')) or decided_at is not null)
);

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
create trigger approvals_set_updated_at before update on public.approvals
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.approvals enable row level security;
alter table public.audit_logs enable row level security;

create policy "Users can read their profile" on public.profiles
for select to authenticated using (id = (select auth.uid()));
create policy "Users can update their profile" on public.profiles
for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Users manage their conversations" on public.conversations
for all to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users manage their messages" on public.messages
for all to authenticated using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
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

create policy "Users can view their approvals" on public.approvals
for select to authenticated using (user_id = (select auth.uid()));

-- Approval decisions and execution state must be changed by trusted server code,
-- not directly by a browser client.
create policy "Users can view their audit history" on public.audit_logs
for select to authenticated using (user_id = (select auth.uid()));

-- Deliberately no browser INSERT/UPDATE/DELETE policies for audit_logs.
-- The server should write audit events using a protected service-role client.
