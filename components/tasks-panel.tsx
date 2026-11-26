"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check, ListTodo, Plus } from "lucide-react";

type Task = {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "blocked" | "done" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  due_at: string | null;
};

const statuses = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;
const priorities = ["low", "normal", "high", "urgent"] as const;

export default function TasksPanel() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("normal");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadTasks() {
      try {
        const response = await fetch("/api/tasks");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Tasks could not be loaded.");
        if (active) setTasks(data.tasks ?? []);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Tasks could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadTasks();
    return () => { active = false; };
  }, []);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, priority }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Task could not be created.");
      setTasks((current) => [data.task, ...current]);
      setTitle("");
      setDescription("");
      setPriority("normal");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Task could not be created.");
    } finally {
      setSaving(false);
    }
  }

  async function updateTask(id: string, changes: Partial<Pick<Task, "status" | "priority">>) {
    try {
      const response = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Task could not be updated.");
      setTasks((current) => current.map((task) => task.id === id ? data.task : task));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Task could not be updated.");
    }
  }

  const openTasks = tasks.filter((task) => !["done", "cancelled"].includes(task.status)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-300/10 text-violet-200"><ListTodo size={19}/></div><div><h2 className="text-sm font-medium text-slate-200">Tasks</h2><p className="mt-1 text-xs text-slate-500">Keep track of the work you want to finish.</p></div></div>
        <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] text-slate-400">{openTasks} open</span>
      </div>

      <form onSubmit={createTask} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
        <h3 className="mb-4 text-sm font-medium text-slate-200">Add a task</h3>
        <input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} placeholder="What needs to be done?" className="w-full rounded-xl border border-white/10 bg-[#0b1018] px-3 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-300/40"/>
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={4000} rows={2} placeholder="Optional details" className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-[#0b1018] px-3 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-300/40"/>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <select value={priority} onChange={(event) => setPriority(event.target.value as Task["priority"])} className="rounded-lg border border-white/10 bg-[#0b1018] px-3 py-2 text-xs text-slate-300">{priorities.map((item) => <option key={item} value={item}>{item} priority</option>)}</select>
          <button type="submit" disabled={saving || !title.trim()} className="flex items-center gap-2 rounded-lg bg-violet-300 px-4 py-2.5 text-xs font-semibold text-[#11111a] transition hover:bg-violet-200 disabled:opacity-50"><Plus size={14}/>{saving ? "Adding..." : "Add task"}</button>
        </div>
      </form>

      {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-xs text-rose-200">{error}</p>}
      {loading ? <p className="py-8 text-center text-xs text-slate-500">Loading tasks...</p> : tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-xs text-slate-500">No tasks yet. Add one above or ask the assistant to create it.</div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <article key={task.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1"><div className="flex items-start gap-2"><div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${task.status === "done" ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200" : "border-white/15 text-transparent"}`}>{task.status === "done" && <Check size={12}/>}</div><div><h3 className={`text-sm font-medium ${task.status === "done" ? "text-slate-500 line-through" : "text-slate-200"}`}>{task.title}</h3>{task.description && <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-500">{task.description}</p>}</div></div></div>
                <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[9px] text-slate-500">{task.priority}</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                {task.due_at && <span className="text-[10px] text-slate-600">Due {new Date(task.due_at).toLocaleDateString()}</span>}
                <select aria-label={`Status for ${task.title}`} value={task.status} onChange={(event) => void updateTask(task.id, { status: event.target.value as Task["status"] })} className="ml-auto rounded-lg border border-white/10 bg-[#0b1018] px-2.5 py-2 text-[10px] text-slate-300">{statuses.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}</select>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
