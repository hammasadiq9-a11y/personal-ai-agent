import { NextResponse } from "next/server";
import { askAgent, type ChatMessage } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 8_000;

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
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !Array.isArray((body as { messages?: unknown }).messages)) {
      return NextResponse.json({ error: "A messages array is required." }, { status: 400 });
    }

    const messages = (body as { messages: unknown[] }).messages;
    if (
      messages.length === 0 ||
      messages.length > MAX_MESSAGES ||
      !messages.every(isChatMessage) ||
      messages[messages.length - 1]?.role !== "user"
    ) {
      return NextResponse.json({ error: "The conversation is invalid or too long." }, { status: 400 });
    }

    const reply = await askAgent(messages as ChatMessage[]);
    return NextResponse.json({ reply });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The assistant could not complete the request.";
    const status = message.includes("OPENAI_API_KEY") ? 503 : 500;
    return NextResponse.json(
      { error: status === 503 ? "AI is not configured. Add your API key to the server environment." : "Something went wrong while generating a response." },
      { status },
    );
  }
}
