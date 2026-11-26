import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const CATEGORIES = ["preference", "goal", "project", "workflow", "fact", "other"] as const;

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return NextResponse.json({ error: "Sign in to view saved memory." }, { status: 401 });
    }

    const searchTerm = new URL(request.url).searchParams.get("q")?.trim().slice(0, 200);
    let query = supabase
      .from("memories")
      .select("id, title, content, category, pinned, project_id, updated_at")
      .eq("user_id", authData.user.id)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(50);

    if (searchTerm) {
      query = query.textSearch("search_document", searchTerm, { type: "websearch", config: "english" });
    }

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ memories: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Saved memory could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return NextResponse.json({ error: "Sign in to save memory." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "The request must contain valid JSON." }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "A memory object is required." }, { status: 400 });
    }

    const input = body as Record<string, unknown>;
    const title = typeof input.title === "string" ? input.title.trim() : "";
    const content = typeof input.content === "string" ? input.content.trim() : "";
    const category = typeof input.category === "string" ? input.category : "other";
    const projectId = input.projectId === undefined || input.projectId === null ? null : input.projectId;

    if (!title || title.length > 160 || !content || content.length > 4000) {
      return NextResponse.json({ error: "Title or memory content is invalid or too long." }, { status: 400 });
    }
    if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
      return NextResponse.json({ error: "The memory category is invalid." }, { status: 400 });
    }
    if (projectId !== null && (typeof projectId !== "string" || !/^[0-9a-f-]{36}$/i.test(projectId))) {
      return NextResponse.json({ error: "The project ID is invalid." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("memories")
      .insert({
        user_id: authData.user.id,
        title,
        content,
        category,
        project_id: projectId,
        source: "user",
      })
      .select("id, title, content, category, pinned, project_id, updated_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ memory: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "The memory could not be saved." }, { status: 500 });
  }
}
