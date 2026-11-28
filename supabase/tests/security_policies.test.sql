-- Structural security checks for the Supabase schema.
-- Run only against a local/ephemeral Supabase database:
--   npx supabase test db
-- These checks inspect policy/grant configuration. They do not replace
-- two-account behavioral tests of SELECT/INSERT/UPDATE/DELETE isolation.

begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.conversations'::regclass), 'conversations has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.messages'::regclass), 'messages has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.projects'::regclass), 'projects has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.tasks'::regclass), 'tasks has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.memories'::regclass), 'memories has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.approvals'::regclass), 'approvals has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.audit_logs'::regclass), 'audit_logs has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.api_rate_limits'::regclass), 'api_rate_limits has RLS enabled');

select ok(not has_table_privilege('anon', 'public.api_rate_limits', 'SELECT'), 'anon cannot read rate-limit storage');
select ok(not has_table_privilege('authenticated', 'public.api_rate_limits', 'SELECT'), 'authenticated cannot read rate-limit storage');
select ok(has_table_privilege('service_role', 'public.api_rate_limits', 'SELECT'), 'service_role can read rate-limit storage');

select ok(not has_function_privilege('anon', 'public.consume_chat_rate_limit(uuid,integer,integer)', 'EXECUTE'), 'anon cannot execute the rate-limit function');
select ok(not has_function_privilege('authenticated', 'public.consume_chat_rate_limit(uuid,integer,integer)', 'EXECUTE'), 'authenticated cannot execute the rate-limit function');
select ok(has_function_privilege('service_role', 'public.consume_chat_rate_limit(uuid,integer,integer)', 'EXECUTE'), 'service_role can execute the rate-limit function');

select is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'api_rate_limits'), 0, 'rate-limit storage has no browser RLS policies');

select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Users can read their profile' and qual like '%auth.uid%'), 'profile reads are owner-scoped');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Users can update their profile' and with_check like '%auth.uid%'), 'profile updates are owner-scoped');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversations' and policyname = 'Users manage their conversations' and qual like '%auth.uid%' and with_check like '%auth.uid%'), 'conversation access is owner-scoped');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = 'Users can read their messages' and qual like '%auth.uid%'), 'message reads are owner-scoped');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = 'Users can send their own messages' and with_check like '%auth.uid%'), 'message inserts validate ownership');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'Users manage their projects' and qual like '%auth.uid%' and with_check like '%auth.uid%'), 'project access is owner-scoped');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tasks' and policyname = 'Users manage their tasks' and qual like '%auth.uid%' and with_check like '%auth.uid%'), 'task access is owner-scoped');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'memories' and policyname = 'Users manage their memories' and qual like '%auth.uid%' and with_check like '%auth.uid%'), 'memory access is owner-scoped');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'approvals' and policyname = 'Users can view their approvals' and cmd = 'SELECT' and qual like '%auth.uid%'), 'approval records are readable only by their owner');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_logs' and policyname = 'Users can view their audit history' and cmd = 'SELECT' and qual like '%auth.uid%'), 'audit history is readable only by its owner');

select ok(exists (select 1 from pg_constraint where conname = 'tasks_project_user_fk'), 'tasks enforce project/user ownership with a composite foreign key');
select ok(exists (select 1 from pg_constraint where conname = 'memories_project_user_fk'), 'memories enforce project/user ownership with a composite foreign key');
select ok(exists (select 1 from pg_constraint where conname = 'messages_conversation_user_fk'), 'messages enforce conversation/user ownership with a composite foreign key');

select * from finish();

rollback;
