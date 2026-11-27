import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return NextResponse.json({ error: "Sign in to view workspace status." }, { status: 401 });
    }

    return NextResponse.json(
      {
        databaseConfigured: Boolean(
          process.env.NEXT_PUBLIC_SUPABASE_URL &&
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
          process.env.SUPABASE_SERVICE_ROLE_KEY
        ),
        aiConfigured: Boolean(process.env.OPENAI_API_KEY),
        webSearchEnabled: process.env.ENABLE_WEB_SEARCH === "true",
        githubReadEnabled: Boolean(process.env.GITHUB_TOKEN),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Workspace status is unavailable." }, { status: 503 });
  }
}
