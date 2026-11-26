import { NextResponse } from "next/server";
import { hashPayload } from "@/lib/security/payload-hash";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ approvalId: string }> },
) {
  const { approvalId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(approvalId)) {
    return NextResponse.json({ error: "The approval ID is invalid." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The request must contain valid JSON." }, { status: 400 });
  }

  const decision = body && typeof body === "object"
    ? (body as Record<string, unknown>).decision
    : null;

  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json({ error: "Choose approve or reject." }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return NextResponse.json({ error: "Sign in to decide this approval." }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: approval, error: fetchError } = await admin
      .from("approvals")
      .select("id, action_type, payload, payload_hash, status, expires_at")
      .eq("id", approvalId)
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!approval) return NextResponse.json({ error: "Approval not found." }, { status: 404 });
    if (approval.status !== "pending") {
      return NextResponse.json({ error: "This approval has already been decided." }, { status: 409 });
    }

    if (approval.expires_at && new Date(approval.expires_at).getTime() <= Date.now()) {
      await admin
        .from("approvals")
        .update({ status: "expired" })
        .eq("id", approvalId)
        .eq("user_id", authData.user.id)
        .eq("status", "pending");
      return NextResponse.json({ error: "This proposal has expired. A new proposal is required." }, { status: 410 });
    }

    const currentHash = hashPayload(approval.payload);
    if (currentHash !== approval.payload_hash) {
      return NextResponse.json({ error: "The proposal changed. A new approval is required." }, { status: 409 });
    }

    const nextStatus = decision === "approve" ? "approved" : "rejected";
    const { data, error } = await admin
      .from("approvals")
      .update({ status: nextStatus, decided_at: new Date().toISOString() })
      .eq("id", approvalId)
      .eq("user_id", authData.user.id)
      .eq("status", "pending")
      .eq("payload_hash", currentHash)
      .select("id, action_type, summary, status, decided_at")
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "This approval was already updated." }, { status: 409 });

    await admin.from("audit_logs").insert({
      user_id: authData.user.id,
      event_type: decision === "approve" ? "approval.approved" : "approval.rejected",
      resource_type: "approval",
      resource_id: approvalId,
      details: { action_type: approval.action_type, payload_hash: currentHash },
    });

    return NextResponse.json({ approval: data });
  } catch {
    return NextResponse.json({ error: "The approval decision could not be saved." }, { status: 500 });
  }
}
