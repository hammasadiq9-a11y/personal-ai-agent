import { NextResponse } from "next/server";
import { askAgent, type ChatMessage } from "@/lib/agent";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 8_000;
const MAX_TOTAL_CONTENT_LENGTH = 32_000;
const MAX_BODY_BYTES = 64 * 1024;

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
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return NextResponse.json({ error: "Authentication is not configured yet." }, { status: 503 });
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ error: "Sign in to use your assistant." }, { status: 401 });
    }
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

  const messages = (body as { messages: unknown[] }).messages;
  const totalLength = messages.reduce(
    (total, item) => total + (item && typeof item === "object" && typeof (item as Record<string, unknown>).content === "string"
      ? ((item as Record<string, string>).content.length)
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

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "AI is not configured. Add the API key to the server environment." },
      { status: 503 },
    );
  }

  try {
    const reply = await askAgent(messages);
    if (!reply) {
      return NextResponse.json({ error: "The assistant returned an empty response. Try again." }, { status: 502 });
    }
    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json(
      { error: "The assistant is temporarily unavailable. Try again shortly." },
      { status: 502 },
    );
  }
}
