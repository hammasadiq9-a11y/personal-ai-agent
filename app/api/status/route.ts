import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    databaseConfigured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
    ),
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    webSearchEnabled: process.env.ENABLE_WEB_SEARCH === "true",
    githubReadEnabled: Boolean(process.env.GITHUB_TOKEN),
    githubWriteEnabled: Boolean(process.env.GITHUB_WRITE_TOKEN),
  });
}
