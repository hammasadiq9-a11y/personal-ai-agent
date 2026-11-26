import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = ["todo", "in_progress", "blocked", "done", "cancelled"];
const PRIORITIES = ["low", "normal", "high", "urgent"];

export async function PATCH(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await context.params;
  if (!UUID_PATTERN.test(taskId)) return NextResponse.json({ error: "The task ID is invalid." }, { status: 400 });

  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: "Sign in to update this task." }, { status: 401 });

    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 8 * 1024) return NextResponse.json({ error: "The task update is too large." }, { status: 413 });

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "The request must contain valid JSON." }, { status: 400 });
    }

    if (!body || typeof body !== "object") return NextResponse.json({ error: "Task changes are required." }, { status: 400 });
    const input = body as Record<string, unknown>;
    const update: Record<string, unknown> = {};

    if (input.title !== undefined) {
      if (typeof input.title !== "string" || !input.title.trim() || input.title.trim().length > 200) return NextResponse.json({ error: "The task title is invalid." }, { status: 400 });
      update.title = input.title.trim();
    }
    if (input.description !== undefined) {
      if (typeof input.description !== "string" || input.description.length > 4000) return NextResponse.json({ error: "The task description is invalid." }, { status: 400 });
      update.description = input.description.trim();
    }
    if (input.status !== undefined) {
      if (!STATUSES.includes(String(input.status))) return NextResponse.json({ error: "The task status is invalid." }, { status: 400 });
      update.status = input.status;
    }
    if (input.priority !== undefined) {
      if (!PRIORITIES.includes(String(input.priority))) return NextResponse.json({ error: "The task priority is invalid." }, { status: 400 });
      update.priority = input.priority;
    }
    if (input.dueAt !== undefined) {
      if (input.dueAt === null || input.dueAt === "") update.due_at = null;
      else if (typeof input.dueAt === "string" && !Number.isNaN(new Date(input.dueAt).getTime())) update.due_at = new Date(input.dueAt).toISOString();
      else return NextResponse.json({ error: "The due date is invalid." }, { status: 400 });
    }

    if (Object.keys(update).length === 0) return NextResponse.json({ error: "No valid task changes were supplied." }, { status: 400 });

    const { data, error } = await supabase
      .from("tasks")
      .update(update)
      .eq("id", taskId)
      .eq("user_id", authData.user.id)
      .select("id, title, description, status, priority, due_at, project_id, created_at, updated_at")
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Task not found." }, { status: 404 });
    return NextResponse.json({ task: data });
  } catch {
    return NextResponse.json({ error: "The task could not be updated." }, { status: 500 });
  }
}
