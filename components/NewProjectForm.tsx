"use client";

import { useState } from "react";
import Link from "next/link";

interface Person {
  name: string;
  email: string;
  skills_text: string;
  prefs_text: string;
  weekly_hours: number;
}

interface Stage {
  id: string;
  status: "running" | "done" | "error";
  label: string;
  detail?: string;
}

interface Done {
  projectId: string;
  proposalId: string;
  passed: boolean;
  stepCount: number;
}

const blank = (email = ""): Person => ({ name: "", email, skills_text: "", prefs_text: "", weekly_hours: 6 });

export default function NewProjectForm({ defaultEmail }: { defaultEmail: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [team, setTeam] = useState<Person[]>([blank(defaultEmail), blank()]);
  const [running, setRunning] = useState(false);
  const [stages, setStages] = useState<Stage[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done | null>(null);

  const update = (i: number, patch: Partial<Person>) => setTeam((t) => t.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (files.length === 0) return setError("Upload at least one project document.");
    if (team.some((p) => !p.name.trim() || !p.email.trim())) return setError("Every teammate needs a name and an email.");

    setRunning(true);
    setStages([]);
    setDone(null);
    const body = new FormData();
    for (const f of files) body.append("files", f);
    body.append("name", name);
    body.append("due_date", dueDate);
    body.append("team", JSON.stringify(team));

    try {
      const res = await fetch("/api/projects/create", { method: "POST", body });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line);
          if (event.type === "stage") {
            setStages((prev) => {
              const next = prev.filter((s) => s.id !== event.id);
              const index = prev.findIndex((s) => s.id === event.id);
              const stage: Stage = { id: event.id, status: event.status, label: event.label, detail: event.detail };
              if (index === -1) return [...next, stage];
              next.splice(index, 0, stage);
              return next;
            });
          } else if (event.type === "done") setDone(event);
          else if (event.type === "error") setError(event.message);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="card">
        <h2>1. Project documents</h2>
        <p className="muted" style={{ marginBottom: "0.6rem" }}>
          Upload the assignment, rubric, or syllabus (PDF, TXT, or MD; under 4 MB total). The agent reads them and sets everything up.
        </p>
        <input type="file" multiple accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        <div className="row2" style={{ marginTop: "0.75rem" }}>
          <input placeholder="Project name (optional, the agent finds it)" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="date" aria-label="Due date override" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <p className="muted" style={{ marginTop: "0.4rem" }}>
          Leave the name and date blank to use what the documents say.
        </p>
      </div>

      <div className="card">
        <h2>2. Your team</h2>
        {team.map((p, i) => (
          <div className="person" key={i}>
            <div className="row2">
              <input placeholder="Name" value={p.name} onChange={(e) => update(i, { name: e.target.value })} />
              <input type="email" placeholder="Email (they sign in with this)" value={p.email} onChange={(e) => update(i, { email: e.target.value })} />
            </div>
            <div className="grid" style={{ marginTop: "0.6rem" }}>
              <textarea rows={2} placeholder="Skills, in your own words (for example: strong writer, good with diagrams)" value={p.skills_text} onChange={(e) => update(i, { skills_text: e.target.value })} />
              <textarea rows={2} placeholder="Preferences or things to avoid" value={p.prefs_text} onChange={(e) => update(i, { prefs_text: e.target.value })} />
              <label className="muted">
                Hours per week available:{" "}
                <input type="number" min={0} max={80} style={{ width: "5rem" }} value={p.weekly_hours} onChange={(e) => update(i, { weekly_hours: Number(e.target.value) })} />
                {team.length > 1 && i > 0 ? (
                  <button type="button" style={{ marginLeft: "1rem" }} onClick={() => setTeam((t) => t.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                ) : null}
              </label>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setTeam((t) => [...t, blank()])}>
          Add a teammate
        </button>
      </div>

      <button className="primary" type="submit" disabled={running}>
        {running ? "Setting up…" : "Create project and draft the plan"}
      </button>

      {stages.length > 0 || error ? (
        <div className="card" style={{ marginTop: "1rem" }} aria-live="polite">
          <h2>Setting up your project</h2>
          {stages.map((s) => (
            <div className="stage" key={s.id}>
              <span className={`badge ${s.status === "done" ? "ok" : s.status === "error" ? "bad" : ""}`}>{s.status === "running" ? "working" : s.status}</span>
              <div>
                <div>{s.label}</div>
                {s.detail ? <div className="muted">{s.detail}</div> : null}
              </div>
            </div>
          ))}
          {error ? <p className="bad" role="alert" style={{ marginTop: "0.5rem" }}>{error}</p> : null}
          {done ? (
            <p style={{ marginTop: "0.75rem" }}>
              <Link className="link" href="/">
                Review the plan ({done.stepCount} steps)
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
