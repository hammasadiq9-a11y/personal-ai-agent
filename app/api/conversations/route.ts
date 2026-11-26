import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return NextResponse.json({ error: "Sign in to view your conversations." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("conversations")
      .select("id, title, updated_at")
      .eq("user_id", authData.user.id)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return NextResponse.json({ conversations: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Conversations could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return NextResponse.json({ error: "Sign in to create a conversation." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "The request must contain valid JSON." }, { status: 400 });
    }

    const title = body && typeof body === "object" && typeof (body as Record<string, unknown>).title === "string"
      ? ((body as Record<string, string>).title.trim())
      : "New conversation";

    if (!title || title.length > 160) {
      return NextResponse.json({ error: "The conversation title is invalid." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: authData.user.id, title })
      .select("id, title, updated_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ conversation: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "The conversation could not be created." }, { status: 500 });
  }
}
