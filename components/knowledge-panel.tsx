"use client";

import { FormEvent, useEffect, useState } from "react";
import { BookOpen, Plus, Trash2 } from "lucide-react";

type Memory = {
  id: string;
  title: string;
  content: string;
  category: string;
  pinned: boolean;
};

const categories = ["preference", "goal", "project", "workflow", "fact", "other"];

export default function KnowledgePanel() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("other");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadMemories() {
      try {
        const response = await fetch("/api/memories");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Saved memory could not be loaded.");
        if (active) setMemories(data.memories ?? []);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Saved memory could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadMemories();
    return () => { active = false; };
  }, []);

  async function saveMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, category }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Memory could not be saved.");
      setMemories((current) => [data.memory, ...current]);
      setTitle("");
      setContent("");
      setCategory("other");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Memory could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteMemory(id: string) {
    try {
      const response = await fetch(`/api/memories/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Memory could not be deleted.");
      setMemories((current) => current.filter((memory) => memory.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Memory could not be deleted.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-300/10 text-violet-200"><BookOpen size={17}/></div>
          <div><h2 className="text-sm font-medium text-slate-200">Saved memory</h2><p className="mt-1 text-xs text-slate-500">Notes the assistant can use as background context.</p></div>
        </div>
        <form onSubmit={saveMemory} className="space-y-3">
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required placeholder="Memory title" className="w-full rounded-xl border border-white/10 bg-[#0b1018] px-3 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-300/40"/>
          <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={4000} required rows={3} placeholder="Write a preference, goal, project detail, or workflow worth keeping..." className="w-full resize-y rounded-xl border border-white/10 bg-[#0b1018] px-3 py-3 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-300/40"/>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-white/10 bg-[#0b1018] px-3 py-2 text-xs text-slate-300">
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <button type="submit" disabled={saving || !title.trim() || !content.trim()} className="flex items-center gap-2 rounded-lg bg-violet-300 px-4 py-2.5 text-xs font-semibold text-[#11111a] transition hover:bg-violet-200 disabled:opacity-50"><Plus size={14}/>{saving ? "Saving..." : "Save memory"}</button>
          </div>
        </form>
        {error && <p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-medium text-slate-200">Your saved notes</h2><span className="text-[10px] text-slate-600">{memories.length} saved</span></div>
        {loading ? <p className="py-8 text-center text-xs text-slate-500">Loading memory...</p> : memories.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-xs text-slate-500">No saved notes yet. Add details you want the assistant to remember.</div>
        ) : (
          <div className="space-y-2">
            {memories.map((memory) => (
              <article key={memory.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-medium text-slate-200">{memory.title}</h3><span className="rounded-full bg-white/[0.06] px-2 py-1 text-[9px] text-slate-500">{memory.category}</span></div><p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-400">{memory.content}</p></div>
                  <button onClick={() => void deleteMemory(memory.id)} className="shrink-0 rounded-lg p-2 text-slate-600 transition hover:bg-rose-400/10 hover:text-rose-300" aria-label={`Delete ${memory.title}`}><Trash2 size={15}/></button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
