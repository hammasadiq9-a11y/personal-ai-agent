import { NextResponse } from "next/server";
import { containsCredentialLikeField, hashPayload } from "@/lib/security/payload-hash";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return NextResponse.json({ error: "Sign in to view approvals." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("approvals")
      .select("id, action_type, summary, payload, status, expires_at, decided_at, created_at")
      .eq("user_id", authData.user.id)
      .in("status", ["pending", "approved", "rejected", "failed"])
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return NextResponse.json({ approvals: data ?? [] });
  } catch {
    return NextResponse.json({ error: "The approval inbox could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return NextResponse.json({ error: "Sign in to create an approval proposal." }, { status: 401 });
    }

    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 24 * 1024) {
      return NextResponse.json({ error: "The proposal is too large." }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "The request must contain valid JSON." }, { status: 400 });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "An approval proposal is required." }, { status: 400 });
    }

    const input = body as Record<string, unknown>;
    const actionType = typeof input.actionType === "string" ? input.actionType.trim() : "";
    const summary = typeof input.summary === "string" ? input.summary.trim() : "";
    const payload = input.payload;

    if (!/^[a-z][a-z0-9_.-]{1,79}$/.test(actionType) || !summary || summary.length > 500) {
      return NextResponse.json({ error: "The action type or summary is invalid." }, { status: 400 });
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ error: "The proposal payload must be an object." }, { status: 400 });
    }

    if (containsCredentialLikeField(payload)) {
      return NextResponse.json({ error: "Approval payloads must not contain credentials or secrets." }, { status: 400 });
    }

    const payloadHash = hashPayload(payload);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("approvals")
      .insert({
        user_id: authData.user.id,
        action_type: actionType,
        summary,
        payload,
        payload_hash: payloadHash,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id, action_type, summary, payload, status, created_at")
      .single();

    if (error) throw error;

    await admin.from("audit_logs").insert({
      user_id: authData.user.id,
      event_type: "approval.created",
      resource_type: "approval",
      resource_id: data.id,
      details: { action_type: actionType },
    });

    return NextResponse.json({ approval: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "The approval proposal could not be created." }, { status: 500 });
  }
}
