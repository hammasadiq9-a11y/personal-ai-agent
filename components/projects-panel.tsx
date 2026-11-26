"use client";

import { FormEvent, useEffect, useState } from "react";
import { Archive, FolderKanban, Plus } from "lucide-react";

type Project = {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "completed" | "archived";
};

export default function ProjectsPanel() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadProjects() {
      try {
        const response = await fetch("/api/projects");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Projects could not be loaded.");
        if (active) setProjects(data.projects ?? []);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Projects could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadProjects();
    return () => { active = false; };
  }, []);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Project could not be created.");
      setProjects((current) => [data.project, ...current]);
      setName("");
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Project could not be created.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveProject(id: string) {
    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Project could not be archived.");
      setProjects((current) => current.filter((project) => project.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Project could not be archived.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-300/10 text-violet-200"><FolderKanban size={19}/></div><div><h2 className="text-sm font-medium text-slate-200">Projects</h2><p className="mt-1 text-xs text-slate-500">Keep your work organised by outcome.</p></div></div>
        <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] text-slate-400">{projects.length} active</span>
      </div>

      <form onSubmit={createProject} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
        <h3 className="mb-4 text-sm font-medium text-slate-200">Create a project</h3>
        <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} placeholder="Project name" className="w-full rounded-xl border border-white/10 bg-[#0b1018] px-3 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-300/40"/>
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={2} placeholder="What is this project about?" className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-[#0b1018] px-3 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-300/40"/>
        <div className="mt-3 flex justify-end"><button type="submit" disabled={saving || !name.trim()} className="flex items-center gap-2 rounded-lg bg-violet-300 px-4 py-2.5 text-xs font-semibold text-[#11111a] transition hover:bg-violet-200 disabled:opacity-50"><Plus size={14}/>{saving ? "Creating..." : "Create project"}</button></div>
      </form>

      {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-xs text-rose-200">{error}</p>}
      {loading ? <p className="py-8 text-center text-xs text-slate-500">Loading projects...</p> : projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-xs text-slate-500">No projects yet. Create one above or ask the assistant to organise your work.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((project) => (
            <article key={project.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
              <div className="flex items-center justify-between gap-2"><span className="rounded-full bg-white/[0.06] px-2 py-1 text-[10px] text-slate-400">{project.status}</span><button onClick={() => void archiveProject(project.id)} className="rounded-lg p-2 text-slate-600 transition hover:bg-white/[0.05] hover:text-slate-300" aria-label={`Archive ${project.name}`}><Archive size={14}/></button></div>
              <h3 className="mt-4 text-sm font-medium text-slate-200">{project.name}</h3>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-500">{project.description || "No description added."}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
