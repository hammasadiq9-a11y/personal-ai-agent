import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/http/read-json";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const PRIORITIES = ["low", "normal", "high", "urgent"];

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: "Sign in to view tasks." }, { status: 401 });

    const status = new URL(request.url).searchParams.get("status");
    let query = supabase
      .from("tasks")
      .select("id, title, description, status, priority, due_at, project_id, created_at, updated_at")
      .eq("user_id", authData.user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (status && ["todo", "in_progress", "blocked", "done", "cancelled"].includes(status)) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ tasks: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Tasks could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: "Sign in to create a task." }, { status: 401 });

    const parsedBody = await readJsonBody(request, 12 * 1024);
    if (!parsedBody.ok) return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
    const body = parsedBody.value;
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Task details are required." }, { status: 400 });
    const input = body as Record<string, unknown>;
    const title = typeof input.title === "string" ? input.title.trim() : "";
    const description = typeof input.description === "string" ? input.description.trim() : "";
    const priority = typeof input.priority === "string" ? input.priority : "normal";
    const projectId = typeof input.projectId === "string" && input.projectId ? input.projectId : null;
    const dueAt = typeof input.dueAt === "string" && input.dueAt ? new Date(input.dueAt) : null;

    if (!title || title.length > 200 || description.length > 4000 || !PRIORITIES.includes(priority)) {
      return NextResponse.json({ error: "The task title, description, or priority is invalid." }, { status: 400 });
    }
    if (projectId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
      return NextResponse.json({ error: "The project ID is invalid." }, { status: 400 });
    }
    if (dueAt && Number.isNaN(dueAt.getTime())) return NextResponse.json({ error: "The due date is invalid." }, { status: 400 });

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: authData.user.id,
        title,
        description,
        priority,
        project_id: projectId,
        due_at: dueAt?.toISOString() ?? null,
      })
      .select("id, title, description, status, priority, due_at, project_id, created_at, updated_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ task: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "The task could not be created." }, { status: 500 });
  }
}
