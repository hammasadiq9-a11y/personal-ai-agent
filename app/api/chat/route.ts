import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/http/read-json";
import { askAgent, type ApprovalProposal, type ChatMessage, type GitHubReadRequest, type MemoryWrite, type ProjectRequest, type SavedMemory, type TaskRequest } from "@/lib/agent";
import { containsCredentialLikeField, hashPayload } from "@/lib/security/payload-hash";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { runGitHubTool } from "@/lib/tools/github";
import { isSupportedGitHubAction } from "@/lib/tools/github-actions";

export const runtime = "nodejs";
export const maxDuration = 60;

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

  const admin = createAdminClient();

  try {
    const { data: allowed, error: rateLimitError } = await admin.rpc(
      "consume_chat_rate_limit",
      { p_user_id: userId, p_max_requests: 20, p_window_seconds: 60 },
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

    const initialResult = await askAgent(messages, (savedMemories ?? []) as SavedMemory[]);
    let reply = initialResult.reply;
    const approvalProposals = initialResult.approvalProposals;
    const memoryWrites = initialResult.memoryWrites;
    const taskIds: string[] = [];
    const projectIds: string[] = [];
    const toolResults: unknown[] = [];

    if (initialResult.githubRequests.length) {
      const githubResults = await Promise.all(
        (initialResult.githubRequests as GitHubReadRequest[]).map(async (toolCall) => {
          try {
            return {
              tool: toolCall.name,
              arguments: toolCall.arguments,
              result: await runGitHubTool(toolCall.name, toolCall.arguments),
            };
          } catch {
            return { tool: toolCall.name, error: "The GitHub lookup failed. Check the connection and try again." };
          }
        }),
      );

      toolResults.push(...githubResults);
    }

    for (const projectCall of initialResult.projectRequests as ProjectRequest[]) {
      if (projectCall.name === "create_project") {
        const name = typeof projectCall.arguments.name === "string" ? projectCall.arguments.name.trim() : "";
        const description = typeof projectCall.arguments.description === "string" ? projectCall.arguments.description.trim() : "";

        if (!name || name.length > 120 || description.length > 2000) {
          toolResults.push({ tool: "create_project", error: "The project details were invalid and were not saved." });
          continue;
        }

        const { data: project, error: projectError } = await supabase
          .from("projects")
          .insert({ user_id: userId, name, description })
          .select("id, name, description, status")
          .single();

        if (projectError) {
          toolResults.push({ tool: "create_project", error: "The project could not be saved." });
          continue;
        }

        projectIds.push(project.id);
        toolResults.push({ tool: "create_project", project });
      } else if (projectCall.name === "list_projects") {
        const { data: projects, error: projectsError } = await supabase
          .from("projects")
          .select("id, name, description, status, updated_at")
          .eq("user_id", userId)
          .neq("status", "archived")
          .order("updated_at", { ascending: false })
          .limit(20);

        if (projectsError) {
          toolResults.push({ tool: "list_projects", error: "The project list could not be loaded." });
          continue;
        }
        toolResults.push({ tool: "list_projects", projects: projects ?? [] });
      }
    }

    for (const taskCall of initialResult.taskRequests as TaskRequest[]) {
      const args = taskCall.arguments;

      if (taskCall.name === "create_task") {
        const title = typeof args.title === "string" ? args.title.trim() : "";
        const description = typeof args.description === "string" ? args.description.trim() : "";
        const priority = ["low", "normal", "high", "urgent"].includes(String(args.priority)) ? String(args.priority) : "normal";
        let projectId = typeof args.projectId === "string" && args.projectId ? args.projectId : null;
        const projectName = typeof args.projectName === "string" ? args.projectName.trim() : "";
        const dueAt = typeof args.dueAt === "string" && args.dueAt ? new Date(args.dueAt) : null;

        if (projectName) {
          const { data: matchedProject, error: projectLookupError } = await supabase
            .from("projects")
            .select("id")
            .eq("user_id", userId)
            .eq("name", projectName)
            .maybeSingle();

          if (projectLookupError || !matchedProject) {
            toolResults.push({ tool: "create_task", error: `Could not find a unique project named "${projectName}".` });
            continue;
          }
          projectId = matchedProject.id;
        }

        if (
          !title ||
          title.length > 200 ||
          description.length > 4000 ||
          (projectId !== null && !UUID_PATTERN.test(projectId)) ||
          (dueAt !== null && Number.isNaN(dueAt.getTime()))
        ) {
          toolResults.push({ tool: "create_task", error: "The task details were invalid and were not saved." });
          continue;
        }

        const { data: task, error: taskError } = await supabase
          .from("tasks")
          .insert({
            user_id: userId,
            title,
            description,
            priority,
            project_id: projectId,
            due_at: dueAt?.toISOString() ?? null,
          })
          .select("id, title, status, priority, due_at")
          .single();

        if (taskError) {
          toolResults.push({ tool: "create_task", error: "The task could not be saved. Check the selected project and try again." });
          continue;
        }
        taskIds.push(task.id);
        toolResults.push({ tool: "create_task", task });
      } else if (taskCall.name === "list_tasks") {
        const status = ["todo", "in_progress", "blocked", "done", "cancelled"].includes(String(args.status))
          ? String(args.status)
          : "all";
        let query = supabase
          .from("tasks")
          .select("id, title, description, status, priority, due_at, project_id")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(20);
        if (status !== "all") query = query.eq("status", status);

        const { data: tasks, error: tasksError } = await query;
        if (tasksError) {
          toolResults.push({ tool: "list_tasks", error: "The task list could not be loaded." });
          continue;
        }
        toolResults.push({ tool: "list_tasks", status, tasks: tasks ?? [] });
      }
    }

    if (toolResults.length) {
      toolResults.push({ tool: "initial_response", content: initialResult.reply });
      const finalResult = await askAgent(
        messages,
        (savedMemories ?? []) as SavedMemory[],
        JSON.stringify(toolResults),
        false,
      );
      reply = finalResult.reply;
    }
    const approvalIds: string[] = [];
    const memoryIds: string[] = [];

    for (const proposal of approvalProposals as ApprovalProposal[]) {
      const payloadSize = new TextEncoder().encode(JSON.stringify(proposal.payload)).byteLength;
      if (
        !isSupportedGitHubAction(proposal.actionType) ||
        !proposal.summary.trim() ||
        proposal.summary.length > 500 ||
        payloadSize > 40 * 1024 ||
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
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
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

    for (const memory of memoryWrites as MemoryWrite[]) {
      const title = memory.title.trim();
      const content = memory.content.trim();
      if (
        !title ||
        title.length > 160 ||
        !content ||
        content.length > 4000 ||
        !["preference", "goal", "project", "workflow", "fact", "other"].includes(memory.category)
      ) {
        continue;
      }

      const { data: saved, error: saveError } = await supabase
        .from("memories")
        .insert({
          user_id: userId,
          title,
          content,
          category: memory.category,
          source: "assistant",
        })
        .select("id")
        .single();

      if (saveError) throw saveError;
      memoryIds.push(saved.id);

      await admin.from("audit_logs").insert({
        user_id: userId,
        event_type: "memory.created",
        resource_type: "memory",
        resource_id: saved.id,
        details: { category: memory.category },
      });
    }

    const notices: string[] = [];
    if (approvalIds.length) notices.push(`I prepared ${approvalIds.length} proposal(s) for review in the Approvals section. Nothing has been executed.`);
    if (memoryIds.length) notices.push(`I saved ${memoryIds.length} note(s) to Knowledge, as requested.`);
    if (taskIds.length) notices.push(`I created ${taskIds.length} task(s) in your workspace.`);
    if (projectIds.length) notices.push(`I created ${projectIds.length} project(s) in your workspace.`);
    const assistantContent = notices.length ? `${reply}\n\n${notices.join(" ")}` : reply;

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

    return NextResponse.json({ reply: assistantContent, conversationId, approvalIds, memoryIds, taskIds, projectIds });
  } catch {
    return NextResponse.json(
      { error: "The assistant could not complete or save this response. Try again.", conversationId: activeConversationId },
      { status: 502 },
    );
  }
}
