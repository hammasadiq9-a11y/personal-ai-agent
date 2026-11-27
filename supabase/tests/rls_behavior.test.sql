-- Behavioral two-account RLS checks against the isolated local Supabase database.
-- All fixture rows are created inside this transaction and rolled back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'd0000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'rls-user-a@example.test', null, now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'e0000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'rls-user-b@example.test', null, now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.projects (id, user_id, name, description) values
  ('10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'User A project', ''),
  ('20000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', 'User B project', '');

insert into public.conversations (id, user_id, title) values
  ('30000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'User A conversation'),
  ('40000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', 'User B conversation');

insert into public.messages (id, conversation_id, user_id, role, content) values
  ('50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'user', 'A private message'),
  ('60000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', 'user', 'B private message');

insert into public.tasks (id, user_id, project_id, title) values
  ('70000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'User A task'),
  ('80000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'User B task');

insert into public.memories (id, user_id, project_id, title, content) values
  ('90000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'A note', 'Private to A'),
  ('a0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'B note', 'Private to B');

insert into public.approvals (id, user_id, action_type, summary, payload_hash) values
  ('b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'github.create_issue', 'A approval', repeat('a', 64)),
  ('c0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', 'github.create_issue', 'B approval', repeat('b', 64));

insert into public.audit_logs (user_id, event_type) values
  ('d0000000-0000-4000-8000-000000000001', 'test.user_a'),
  ('e0000000-0000-4000-8000-000000000002', 'test.user_b');

-- Authenticate as user A.
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::integer from public.profiles), 1, 'user A sees only their profile');
select is((select count(*)::integer from public.conversations), 1, 'user A sees only their conversations');
select is((select count(*)::integer from public.messages), 1, 'user A sees only their messages');
select is((select count(*)::integer from public.projects), 1, 'user A sees only their projects');
select is((select count(*)::integer from public.tasks), 1, 'user A sees only their tasks');
select is((select count(*)::integer from public.memories), 1, 'user A sees only their memories');
select is((select count(*)::integer from public.approvals), 1, 'user A sees only their approvals');
select is((select count(*)::integer from public.audit_logs), 1, 'user A sees only their audit history');

select is(
  (with changed as (
    update public.projects set name = 'Tampered by A'
    where id = '20000000-0000-4000-8000-000000000002'
    returning 1
  ) select count(*)::integer from changed),
  0,
  'user A cannot update user B project'
);

select is(
  (with removed as (
    delete from public.projects
    where id = '20000000-0000-4000-8000-000000000002'
    returning 1
  ) select count(*)::integer from removed),
  0,
  'user A cannot delete user B project'
);

select throws_ok(
  $$insert into public.projects (id, user_id, name)
    values ('11000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'forbidden')$$,
  '42501',
  null,
  'user A cannot create a project owned by user B'
);

select throws_ok(
  $$insert into public.tasks (user_id, project_id, title)
    values ('d0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'cross-account task')$$,
  '42501',
  null,
  'user A cannot attach a task to user B project'
);

select throws_ok(
  $$insert into public.memories (user_id, project_id, title, content)
    values ('d0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'cross-account memory', 'forbidden')$$,
  '42501',
  null,
  'user A cannot attach memory to user B project'
);

select throws_ok(
  $$insert into public.messages (conversation_id, user_id, role, content)
    values ('40000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'user', 'cross-account message')$$,
  '42501',
  null,
  'user A cannot add a message to user B conversation'
);

select throws_ok(
  $$insert into public.approvals (user_id, action_type, summary, payload_hash)
    values ('d0000000-0000-4000-8000-000000000001', 'github.create_issue', 'browser attempt', repeat('c', 64))$$,
  '42501',
  null,
  'browser clients cannot create approval records directly'
);

select throws_ok(
  $$insert into public.audit_logs (user_id, event_type)
    values ('d0000000-0000-4000-8000-000000000001', 'browser.attempt')$$,
  '42501',
  null,
  'browser clients cannot write audit records directly'
);

-- Switch to user B and verify the same isolation in the opposite direction.
reset role;
select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::integer from public.profiles), 1, 'user B sees only their profile');
select is((select count(*)::integer from public.conversations), 1, 'user B sees only their conversations');
select is((select count(*)::integer from public.messages), 1, 'user B sees only their messages');
select is((select count(*)::integer from public.projects), 1, 'user B sees only their projects');
select is((select count(*)::integer from public.tasks), 1, 'user B sees only their tasks');
select is((select count(*)::integer from public.memories), 1, 'user B sees only their memories');
select is((select count(*)::integer from public.approvals), 1, 'user B sees only their approvals');
select is((select count(*)::integer from public.audit_logs), 1, 'user B sees only their audit history');

select * from finish();

rollback;
