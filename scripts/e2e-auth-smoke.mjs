import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
  throw new Error("Local Supabase URL and publishable key are required for the auth smoke test.");
}

const cookieJar = new Map();

function createTestClient() {
  return createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return [...cookieJar.entries()].map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          if (cookie.options?.maxAge === 0 || !cookie.value) {
            cookieJar.delete(cookie.name);
          } else {
            cookieJar.set(cookie.name, cookie.value);
          }
        }
      },
    },
  });
}

function cookieHeader() {
  return [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function appRequest(path, init = {}) {
  const headers = new Headers(init.headers);
  const cookies = cookieHeader();
  if (cookies) headers.set("cookie", cookies);

  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers,
    redirect: "manual",
  });

  for (const rawCookie of response.headers.getSetCookie?.() ?? []) {
    const pair = rawCookie.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator < 1) continue;
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (!value || /max-age=0/i.test(rawCookie)) cookieJar.delete(name);
    else cookieJar.set(name, value);
  }

  return response;
}

async function json(response) {
  return response.json();
}

const email = `ci-${randomUUID()}@example.test`;
const password = `CI-Test-${randomUUID()}-aA9!`;
const supabase = createTestClient();

const signup = await supabase.auth.signUp({ email, password });
assert.equal(signup.error, null, `sign-up failed: ${signup.error?.message ?? "unknown error"}`);
assert.ok(signup.data.user, "sign-up should create a local auth user");

if (!signup.data.session) {
  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const confirmed = await admin.auth.admin.updateUserById(signup.data.user.id, { email_confirm: true });
  assert.equal(confirmed.error, null, `local test user confirmation failed: ${confirmed.error?.message ?? "unknown error"}`);
  const initialSignin = await supabase.auth.signInWithPassword({ email, password });
  assert.equal(initialSignin.error, null, `initial sign-in failed: ${initialSignin.error?.message ?? "unknown error"}`);
  assert.ok(initialSignin.data.session, "confirmed test user should receive a session");
}

const authenticatedPage = await appRequest("/");
assert.equal(authenticatedPage.status, 200, "signed-in users should reach the workspace");

const statusResponse = await appRequest("/api/status");
assert.equal(statusResponse.status, 200, "signed-in users should read workspace status");
const status = await json(statusResponse);
assert.equal(status.databaseConfigured, true);
assert.equal(status.aiConfigured, true);
assert.equal(status.githubReadEnabled, false);

const projectResponse = await appRequest("/api/projects", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "CI smoke project", description: "Created by the isolated auth smoke test" }),
});
const projectBody = await json(projectResponse);
assert.equal(projectResponse.status, 201, `project creation failed: ${JSON.stringify(projectBody)}`);
const projectId = projectBody.project?.id;
assert.ok(projectId, "project creation should return an ID");

const taskResponse = await appRequest("/api/tasks", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ title: "CI smoke task", projectId }),
});
assert.equal(taskResponse.status, 201, "signed-in users should create an owned task");

const memoryResponse = await appRequest("/api/memories", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ title: "CI smoke memory", content: "Private integration-test note", projectId }),
});
assert.equal(memoryResponse.status, 201, "signed-in users should create an owned memory");

const projectListResponse = await appRequest("/api/projects");
assert.equal(projectListResponse.status, 200);
const projectList = await json(projectListResponse);
assert.ok(projectList.projects.some((project) => project.id === projectId));

const signout = await supabase.auth.signOut();
assert.equal(signout.error, null, "sign-out should complete");

const anonymousStatus = await appRequest("/api/status");
assert.equal(anonymousStatus.status, 401, "signed-out users must not read private workspace status");

const anonymousPage = await appRequest("/");
assert.equal(anonymousPage.status, 307, "signed-out users should be redirected from the workspace");
assert.match(anonymousPage.headers.get("location") ?? "", /\/login$/);

const signin = await supabase.auth.signInWithPassword({ email, password });
assert.equal(signin.error, null, `sign-in failed: ${signin.error?.message ?? "unknown error"}`);
assert.ok(signin.data.session, "sign-in should restore a session");

const restoredStatus = await appRequest("/api/status");
assert.equal(restoredStatus.status, 200, "a restored session should access private workspace status");

console.log("Auth/API smoke test passed: signup, sign-in, sign-out, protected page, status, projects, tasks, and memories.");
