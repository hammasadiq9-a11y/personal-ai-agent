import { NextResponse } from "next/server";
import { askAgent, type ApprovalProposal, type ChatMessage, type SavedMemory } from "@/lib/agent";
import { containsCredentialLikeField, hashPayload } from "@/lib/security/payload-hash";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_MESSAGE_LENGTH = 8_000;
const MAX_BODY_BYTES = 16 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json({ error: "Database authentication is not fully configured yet." }, { status: 503 });
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  let userId: string;

  try {
    supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ error: "Sign in to use your assistant." }, { status: 401 });
    }
    userId = data.user.id;
  } catch {
    return NextResponse.json({ error: "Authentication could not be verified." }, { status: 503 });
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "The request is too large." }, { status: 413 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "The request body could not be read." }, { status: 400 });
  }

  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "The request is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "The request must contain valid JSON." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "A message is required." }, { status: 400 });
  }

  const payload = body as { message?: unknown; conversationId?: unknown };
  if (
    typeof payload.message !== "string" ||
    !payload.message.trim() ||
    payload.message.length > MAX_MESSAGE_LENGTH
  ) {
    return NextResponse.json({ error: "The message is empty or too long." }, { status: 400 });
  }

  if (payload.conversationId !== undefined && (
    typeof payload.conversationId !== "string" || !UUID_PATTERN.test(payload.conversationId)
  )) {
    return NextResponse.json({ error: "The conversation ID is invalid." }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "AI is not configured. Add the API key to the server environment." }, { status: 503 });
  }

  try {
    const { data: allowed, error: rateLimitError } = await supabase.rpc(
      "consume_chat_rate_limit",
      { p_max_requests: 20, p_window_seconds: 60 },
    );

    if (rateLimitError) {
      return NextResponse.json({ error: "Usage protection is not configured. Apply the database migration." }, { status: 503 });
    }
    if (!allowed) {
      return NextResponse.json({ error: "You have reached the short-term usage limit. Wait a minute and try again." }, { status: 429 });
    }
  } catch {
    return NextResponse.json({ error: "Usage protection could not be verified." }, { status: 503 });
  }

  let activeConversationId: string | null = null;

  try {
    let conversationId: string;
    let history: ChatMessage[] = [];

    if (typeof payload.conversationId === "string") {
      const { data: conversation, error } = await supabase
        .from("conversations")
        .select("id")
        .eq("id", payload.conversationId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;
      if (!conversation) {
        return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
      }
      conversationId = conversation.id;

      const { data: previousMessages, error: historyError } = await supabase
        .from("messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(19);

      if (historyError) throw historyError;
      history = (previousMessages ?? []).reverse() as ChatMessage[];
    } else {
      const title = payload.message.trim().slice(0, 60) || "New conversation";
      const { data: conversation, error } = await supabase
        .from("conversations")
        .insert({ user_id: userId, title })
        .select("id")
        .single();

      if (error) throw error;
      conversationId = conversation.id;
    }
    activeConversationId = conversationId;

    const userMessage: ChatMessage = { role: "user", content: payload.message.trim() };
    const messages = [...history, userMessage];

    const { error: userMessageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        role: "user",
        content: userMessage.content,
      });

    if (userMessageError) throw userMessageError;

    const { data: savedMemories, error: memoryError } = await supabase
      .from("memories")
      .select("title, content, category")
      .eq("user_id", userId)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(8);

    if (memoryError) throw memoryError;

    const { reply, approvalProposals } = await askAgent(messages, (savedMemories ?? []) as SavedMemory[]);
    const admin = createAdminClient();
    const approvalIds: string[] = [];

    for (const proposal of approvalProposals as ApprovalProposal[]) {
      const payloadSize = new TextEncoder().encode(JSON.stringify(proposal.payload)).byteLength;
      if (
        !/^[a-z][a-z0-9_.-]{1,79}$/.test(proposal.actionType) ||
        !proposal.summary.trim() ||
        proposal.summary.length > 500 ||
        payloadSize > 16 * 1024 ||
        containsCredentialLikeField(proposal.payload)
      ) {
        continue;
      }

      const payloadHash = hashPayload(proposal.payload);
      const { data: approval, error: approvalError } = await admin
        .from("approvals")
        .insert({
          user_id: userId,
          action_type: proposal.actionType,
          summary: proposal.summary.trim(),
          payload: proposal.payload,
          payload_hash: payloadHash,
        })
        .select("id")
        .single();

      if (approvalError) throw approvalError;
      approvalIds.push(approval.id);

      await admin.from("audit_logs").insert({
        user_id: userId,
        event_type: "approval.created",
        resource_type: "approval",
        resource_id: approval.id,
        details: { action_type: proposal.actionType },
      });
    }

    const assistantContent = approvalIds.length
      ? `${reply}\\n\\nI prepared ${approvalIds.length} proposal(s) for review in the Approvals section. Nothing has been executed.`
      : reply;

    const { error: assistantMessageError } = await admin
      .from("messages")
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        role: "assistant",
        content: assistantContent,
      });

    if (assistantMessageError) throw assistantMessageError;

    const { error: updateError } = await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("user_id", userId);

    if (updateError) throw updateError;

    return NextResponse.json({ reply: assistantContent, conversationId, approvalIds });
  } catch {
    return NextResponse.json(
      { error: "The assistant could not complete or save this response. Try again.", conversationId: payload.conversationId ?? null },
      { status: 502 },
    );
  }
}
