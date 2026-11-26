import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/http/read-json";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: "Sign in to view projects." }, { status: 401 });

    const { data, error } = await supabase
      .from("projects")
      .select("id, name, description, status, updated_at")
      .eq("user_id", authData.user.id)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return NextResponse.json({ projects: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Projects could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: "Sign in to create a project." }, { status: 401 });

    const parsedBody = await readJsonBody(request, 8 * 1024);
    if (!parsedBody.ok) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
    }
    const body = parsedBody.value;
    const input = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
    const name = typeof input.name === "string" ? input.name.trim() : "";
    const description = typeof input.description === "string" ? input.description.trim() : "";

    if (!name || name.length > 120 || description.length > 2000) {
      return NextResponse.json({ error: "The project name or description is invalid." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("projects")
      .insert({ user_id: authData.user.id, name, description })
      .select("id, name, description, status, updated_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ project: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "The project could not be created." }, { status: 500 });
  }
}
