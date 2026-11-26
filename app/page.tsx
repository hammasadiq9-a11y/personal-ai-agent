"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowUp, Bot, ChevronDown, CircleHelp, Code2,
  FileText, FolderKanban, Globe2, GraduationCap, Menu, Plus,
  Search, ShieldCheck, Sparkles, Terminal, User, X, LogOut,
} from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };
type Project = { name: string; detail: string; status: string; icon: typeof Code2 };

const projects: Project[] = [
  { name: "Novux", detail: "AI website builder", status: "Active", icon: Code2 },
  { name: "ReleasePilot", detail: "AI code review", status: "In progress", icon: Terminal },
  { name: "Axiom", detail: "Personal AI operating system", status: "Planning", icon: Sparkles },
];

const suggestions = [
  { icon: Code2, title: "Help me build", prompt: "Help me plan and build a software feature. Start by asking what outcome I need." },
  { icon: Globe2, title: "Research something", prompt: "Help me research a topic. Separate verified facts from assumptions and give me useful sources to investigate." },
  { icon: FolderKanban, title: "Organise my projects", prompt: "Help me organise my current projects into priorities, milestones, and next actions." },
  { icon: GraduationCap, title: "Teach me something", prompt: "Teach me a technical concept step by step, with a practical example and a short exercise." },
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeView, setActiveView] = useState("Assistant");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(value?: string) {
    const content = (value ?? input).trim();
    if (!content || loading) return;
    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages.slice(-20) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The assistant could not respond.");
      setMessages([...nextMessages, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reach the assistant.");
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  function newChat() {
    setMessages([]);
    setError("");
    setInput("");
    setActiveView("Assistant");
  }

  return (
    <main className="flex min-h-screen">
      {sidebarOpen && (
        <aside className="fixed inset-y-0 left-0 z-30 flex w-[264px] flex-col border-r border-white/[0.08] bg-[#0c0f16]/95 p-4 backdrop-blur-xl md:sticky md:h-screen">
          <div className="flex items-center justify-between px-2 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-400/10 text-violet-200"><Sparkles size={19} /></div>
              <div><p className="text-sm font-semibold tracking-wide">SIDEKICK</p><p className="text-[10px] tracking-[0.18em] text-slate-500">PERSONAL AI WORKSPACE</p></div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-white/5 md:hidden" aria-label="Close sidebar"><X size={17}/></button>
          </div>

          <button onClick={newChat} className="mt-6 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-slate-200 transition hover:border-violet-300/30 hover:bg-violet-300/[0.07]">
            <Plus size={16}/> New conversation <span className="ml-auto text-[10px] text-slate-600">⌘ K</span>
          </button>

          <div className="mt-8">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">Workspace</p>
            <nav className="mt-3 space-y-1">
              {[
                { label: "Assistant", icon: Bot },
                { label: "Projects", icon: FolderKanban },
                { label: "Research", icon: Search },
                { label: "Knowledge", icon: FileText },
              ].map(({ label, icon: Icon }) => (
                <button key={label} onClick={() => setActiveView(label)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${activeView === label ? "bg-violet-400/10 text-violet-200" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"}`}>
                  <Icon size={16}/>{label}
                </button>
              ))}
            </nav>
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between px-3"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">Your projects</p><button onClick={() => setActiveView("Projects")} className="text-slate-600 hover:text-slate-300" aria-label="View projects"><Plus size={14}/></button></div>
            <div className="mt-3 space-y-1">
              {projects.map((project) => <button key={project.name} onClick={() => setActiveView("Projects")} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-white/[0.04]"><project.icon size={15} className="text-slate-500"/><span className="min-w-0 flex-1"><span className="block text-xs text-slate-300">{project.name}</span><span className="block truncate text-[10px] text-slate-600">{project.detail}</span></span><span className="h-1.5 w-1.5 rounded-full bg-slate-600"/></button>)}
            </div>
          </div>

          <div className="mt-auto space-y-1 border-t border-white/[0.07] pt-4">
            <button onClick={() => void signOut()} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-500 hover:bg-white/[0.04] hover:text-slate-300"><LogOut size={16}/> Sign out</button>
            <div className="flex items-center gap-3 rounded-xl bg-white/[0.035] p-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700/60 text-slate-300"><User size={15}/></div><div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-300">Personal workspace</p><p className="text-[10px] text-slate-600">Local preview</p></div><ChevronDown size={14} className="text-slate-600"/></div>
          </div>
        </aside>
      )}

      <section className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="flex h-[68px] items-center justify-between border-b border-white/[0.07] px-5 md:px-8">
          <div className="flex items-center gap-3">
            {!sidebarOpen && <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5" aria-label="Open sidebar"><Menu size={18}/></button>}
            <div><p className="text-sm font-medium text-slate-200">{activeView}</p><p className="text-[11px] text-slate-600">Your thinking and execution workspace</p></div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-400"/><span className="text-[10px] text-slate-500">AI setup required</span></div>
        </header>

        {activeView === "Assistant" ? (
          <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 md:px-8">
            {messages.length === 0 ? (
              <div className="flex flex-1 flex-col justify-center pb-20 pt-16">
                <div className="mb-8 flex items-center gap-2 text-xs text-violet-300/80"><span className="h-px w-8 bg-violet-400/40"/><Sparkles size={13}/> YOUR PERSONAL AI</div>
                <h1 className="max-w-2xl text-4xl font-medium leading-[1.12] tracking-tight text-slate-100 md:text-5xl">Make room for <span className="bg-gradient-to-r from-violet-300 to-cyan-200 bg-clip-text text-transparent">bigger thinking.</span></h1>
                <p className="mt-5 max-w-xl text-sm leading-7 text-slate-400">A workspace for building products, solving problems, learning new skills, and turning ideas into focused action.</p>
                <div className="mt-12 grid gap-3 sm:grid-cols-2">
                  {suggestions.map(({ icon: Icon, title, prompt }) => <button key={title} onClick={() => void sendMessage(prompt)} className="group rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 text-left transition hover:border-violet-300/25 hover:bg-violet-300/[0.04]"><div className="mb-4 flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] text-slate-300 group-hover:text-violet-200"><Icon size={16}/></div><p className="text-sm font-medium text-slate-200">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{title === "Help me build" ? "Plan features and solve engineering problems." : title === "Research something" ? "Explore a question with structured thinking." : title === "Organise my projects" ? "Turn scattered work into clear priorities." : "Understand concepts through practical examples."}</p></button>)}
                </div>
              </div>
            ) : (
              <div className="flex-1 space-y-7 py-10">
                {messages.map((message, index) => <div key={index} className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}><div className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${message.role === "assistant" ? "border border-violet-300/20 bg-violet-300/10 text-violet-200" : "bg-slate-700/70 text-slate-200"}`}>{message.role === "assistant" ? <Sparkles size={15}/> : <User size={15}/>}</div><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-7 ${message.role === "assistant" ? "border border-white/[0.07] bg-white/[0.025] text-slate-300" : "bg-violet-400/10 text-slate-100"}`}><p className="whitespace-pre-wrap break-words">{message.content}</p></div></div>)}
                {loading && <div className="flex items-center gap-3 text-sm text-slate-500"><div className="flex h-8 w-8 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-300/10 text-violet-200"><Sparkles size={15}/></div><span className="animate-pulse">Thinking through this...</span></div>}
                {error && <div role="alert" className="ml-11 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-xs text-rose-200">{error}</div>}
                <div ref={bottomRef}/>
              </div>
            )}

            <div className="sticky bottom-0 pb-6 pt-4">
              <form onSubmit={submit} className="rounded-2xl border border-white/[0.12] bg-[#111620]/95 p-2 shadow-2xl shadow-black/20 backdrop-blur-xl focus-within:border-violet-300/30">
                <textarea ref={textareaRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onKeyDown} rows={2} maxLength={8000} placeholder="Tell Sidekick what you're working on..." className="max-h-40 min-h-14 w-full resize-y bg-transparent px-3 py-2 text-sm leading-6 text-slate-200 outline-none placeholder:text-slate-600" />
                <div className="flex items-center justify-between px-2 pb-1">
                  <div className="flex items-center gap-2 text-[10px] text-slate-600"><ShieldCheck size={13}/> You stay in control <span className="hidden sm:inline">· Enter to send · Shift + Enter for a new line</span></div>
                  <button type="submit" disabled={!input.trim() || loading} className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-300 text-[#11111a] transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-30" aria-label="Send message"><ArrowUp size={18}/></button>
                </div>
              </form>
              <p className="mt-3 text-center text-[10px] text-slate-700">Sidekick can make mistakes. Verify important information before acting.</p>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-4xl flex-1 px-5 py-12 md:px-8">
            <div className="mb-8 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-300/10 text-violet-200">{activeView === "Projects" ? <FolderKanban size={19}/> : activeView === "Research" ? <Globe2 size={19}/> : <FileText size={19}/>}</div><div><h1 className="text-2xl font-medium text-slate-100">{activeView}</h1><p className="mt-1 text-sm text-slate-500">This workspace is being prepared.</p></div></div>
            {activeView === "Projects" ? <div className="grid gap-3 sm:grid-cols-2">{projects.map((project) => <div key={project.name} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5"><div className="flex items-center justify-between"><project.icon size={19} className="text-violet-200"/><span className="rounded-full bg-white/[0.06] px-2 py-1 text-[10px] text-slate-400">{project.status}</span></div><h2 className="mt-5 text-base font-medium text-slate-200">{project.name}</h2><p className="mt-1 text-xs text-slate-500">{project.detail}</p></div>)}</div> : <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center"><CircleHelp className="mx-auto text-slate-600" size={24}/><p className="mt-4 text-sm text-slate-400">This module will be connected in a later milestone.</p><button onClick={() => setActiveView("Assistant")} className="mt-4 text-xs text-violet-300 hover:text-violet-200">Return to assistant</button></div>}
          </div>
        )}
      </section>
    </main>
  );
}
