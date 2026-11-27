import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const inbucketUrl = process.env.SUPABASE_INBUCKET_URL ?? "http://127.0.0.1:54324";

async function confirmationUrl(email: string): Promise<string> {
  const mailbox = encodeURIComponent(email);
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const inbox = await fetch(\`\${inbucketUrl}/api/v1/mailbox/\${mailbox}\`);
    if (inbox.ok) {
      const payload: unknown = await inbox.json();
      const messages = Array.isArray(payload)
        ? payload
        : payload && typeof payload === "object" && "messages" in payload
          ? (payload as { messages: unknown[] }).messages
          : [];

      for (const item of messages) {
        if (!item || typeof item !== "object" || !("id" in item)) continue;
        const detail = await fetch(\`\${inbucketUrl}/api/v1/mailbox/\${mailbox}/\${encodeURIComponent(String(item.id))}\`);
        if (!detail.ok) continue;
        const message = await detail.text();
        const match = message.match(/https?:\/\/[^\s"'<>]+/);
        if (match) return match[0].replaceAll("&amp;", "&").replaceAll("=\n", "=");
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("No confirmation email arrived in the local Supabase mailbox within 30 seconds.");
}

test("email confirmation, sign-in/out, protected navigation, and persisted browser session", async ({ page }) => {
  test.setTimeout(90_000);
  const email = \`browser-\${randomUUID()}@example.test\`;
  const password = \`Browser-Test-\${randomUUID()}-aA9!\`;

  await page.goto(baseUrl);
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");

  const verifyUrl = await confirmationUrl(email);
  await page.goto(verifyUrl);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});
