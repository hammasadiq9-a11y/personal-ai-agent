import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;

  if (!UUID_PATTERN.test(conversationId)) {
    return NextResponse.json({ error: "The conversation ID is invalid." }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return NextResponse.json({ error: "Sign in to view this conversation." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", conversationId)
      .eq("user_id", authData.user.id)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) throw error;
    return NextResponse.json({ messages: data ?? [] });
  } catch {
    return NextResponse.json({ error: "The conversation could not be loaded." }, { status: 500 });
  }
}
