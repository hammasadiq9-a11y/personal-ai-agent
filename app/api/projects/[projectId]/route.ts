import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/http/read-json";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  if (!UUID_PATTERN.test(projectId)) return NextResponse.json({ error: "The project ID is invalid." }, { status: 400 });

  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: "Sign in to update this project." }, { status: 401 });

    const parsedBody = await readJsonBody(request, 8 * 1024);
    if (!parsedBody.ok) return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
    const body = parsedBody.value;
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Project changes are required." }, { status: 400 });
    const input = body as Record<string, unknown>;
    const update: Record<string, unknown> = {};

    if (input.name !== undefined) {
      if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 120) {
        return NextResponse.json({ error: "The project name is invalid." }, { status: 400 });
      }
      update.name = input.name.trim();
    }
    if (input.description !== undefined) {
      if (typeof input.description !== "string" || input.description.length > 2000) {
        return NextResponse.json({ error: "The project description is invalid." }, { status: 400 });
      }
      update.description = input.description.trim();
    }
    if (input.status !== undefined) {
      if (!["active", "paused", "completed", "archived"].includes(String(input.status))) {
        return NextResponse.json({ error: "The project status is invalid." }, { status: 400 });
      }
      update.status = input.status;
    }

    if (Object.keys(update).length === 0) return NextResponse.json({ error: "No valid project changes were supplied." }, { status: 400 });

    const { data, error } = await supabase
      .from("projects")
      .update(update)
      .eq("id", projectId)
      .eq("user_id", authData.user.id)
      .select("id, name, description, status, updated_at")
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    return NextResponse.json({ project: data });
  } catch {
    return NextResponse.json({ error: "The project could not be updated." }, { status: 500 });
  }
}
