import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ memoryId: string }> },
) {
  const { memoryId } = await context.params;

  if (!UUID_PATTERN.test(memoryId)) {
    return NextResponse.json({ error: "The memory ID is invalid." }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return NextResponse.json({ error: "Sign in to manage saved memory." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("memories")
      .delete()
      .eq("id", memoryId)
      .eq("user_id", authData.user.id)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Memory not found." }, { status: 404 });

    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "The memory could not be deleted." }, { status: 500 });
  }
}
