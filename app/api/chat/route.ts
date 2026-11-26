import { NextResponse } from "next/server";
import { askAgent, type ChatMessage } from "@/lib/agent";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 8_000;
const MAX_TOTAL_CONTENT_LENGTH = 32_000;
const MAX_BODY_BYTES = 64 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0 &&
    message.content.length <= MAX_MESSAGE_LENGTH
  );
}

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

  if (!body || typeof body !== "object" || !Array.isArray((body as { messages?: unknown }).messages)) {
    return NextResponse.json({ error: "A messages array is required." }, { status: 400 });
  }

  const payload = body as { messages: unknown[]; conversationId?: unknown };
  const messages = payload.messages;
  const totalLength = messages.reduce(
    (total, item) => total + (item && typeof item === "object" && typeof (item as Record<string, unknown>).content === "string"
      ? (item as Record<string, string>).content.length
      : 0),
    0,
  );

  if (
    messages.length === 0 ||
    messages.length > MAX_MESSAGES ||
    !messages.every(isChatMessage) ||
    messages[messages.length - 1]?.role !== "user" ||
    totalLength > MAX_TOTAL_CONTENT_LENGTH
  ) {
    return NextResponse.json({ error: "The conversation is invalid or too long." }, { status: 400 });
  }

  if (payload.conversationId !== undefined && (
    typeof payload.conversationId !== "string" || !UUID_PATTERN.test(payload.conversationId)
  )) {
    return NextResponse.json({ error: "The conversation ID is invalid." }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "AI is not configured. Add the API key to the server environment." }, { status: 503 });
  }

  let conversationId: string | null = null;

  try {
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
    } else {
      const firstUserMessage = messages.find((message) => (message as ChatMessage).role === "user") as ChatMessage;
      const title = firstUserMessage.content.trim().slice(0, 60) || "New conversation";
      const { data: conversation, error } = await supabase
        .from("conversations")
        .insert({ user_id: userId, title })
        .select("id")
        .single();

      if (error) throw error;
      conversationId = conversation.id;
    }

    const latestUserMessage = messages[messages.length - 1] as ChatMessage;
    const { error: userMessageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        role: "user",
        content: latestUserMessage.content,
      });

    if (userMessageError) throw userMessageError;

    const reply = await askAgent(messages);
    if (!reply) {
      return NextResponse.json({ error: "The assistant returned an empty response. Try again.", conversationId }, { status: 502 });
    }

    const admin = createAdminClient();
    const { error: assistantMessageError } = await admin
      .from("messages")
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        role: "assistant",
        content: reply,
      });

    if (assistantMessageError) throw assistantMessageError;

    const { error: updateError } = await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("user_id", userId);

    if (updateError) throw updateError;

    return NextResponse.json({ reply, conversationId });
  } catch {
    return NextResponse.json(
      { error: "The assistant could not complete or save this response. Try again.", conversationId },
      { status: 502 },
    );
  }
}
