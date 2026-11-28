-- Keep rate-limit storage inaccessible to browser roles at both the
-- privilege and row-policy layers. The server uses the service-role client.
revoke all on table public.api_rate_limits from public, anon, authenticated;
grant all on table public.api_rate_limits to service_role;
