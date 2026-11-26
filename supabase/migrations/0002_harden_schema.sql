-- Harden the initial schema for existing installations.
alter function public.set_updated_at() set search_path = '';

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.consume_chat_rate_limit(integer, integer) from public, anon;
grant execute on function public.consume_chat_rate_limit(integer, integer) to authenticated;

create index if not exists memories_project_user_idx on public.memories(project_id, user_id);
create index if not exists messages_conversation_user_idx on public.messages(conversation_id, user_id);
create index if not exists messages_user_id_idx on public.messages(user_id);
create index if not exists tasks_project_user_idx on public.tasks(project_id, user_id);
