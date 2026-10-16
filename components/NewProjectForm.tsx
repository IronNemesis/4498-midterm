"use client";

import { useState } from "react";
import Link from "next/link";
import AgentActivity, { type ActivityItem } from "./AgentActivity";
import { celebrate } from "./celebrate";
import { Avatar, Icon } from "./ui";

interface Person {
  name: string;
  email: string;
  skills_text: string;
  prefs_text: string;
  weekly_hours: number;
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
  const [over, setOver] = useState(false);
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [team, setTeam] = useState<Person[]>([blank(defaultEmail), blank()]);
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done | null>(null);

  const update = (i: number, patch: Partial<Person>) => setTeam((t) => t.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const addFiles = (list: FileList | null) => setFiles((prev) => [...prev, ...Array.from(list ?? [])].filter((f, i, all) => all.findIndex((g) => g.name === f.name) === i));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (files.length === 0) return setError("Upload at least one project document.");
    if (team.some((p) => !p.name.trim() || !p.email.trim())) return setError("Every teammate needs a name and an email.");

    setRunning(true);
    setItems([]);
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
            const item: ActivityItem = { key: event.id, status: event.status, label: event.label, detail: event.detail || undefined };
            setItems((prev) => (prev.some((p) => p.key === item.key) ? prev.map((p) => (p.key === item.key ? item : p)) : [...prev, item]));
          } else if (event.type === "done") {
            setDone(event);
            celebrate();
          } else if (event.type === "error") setError(event.message);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const started = running || items.length > 0;

  return (
    <form onSubmit={submit}>
      <h2 className="h2">
        <span className="section-num">1</span>Project documents
      </h2>
      <label
        className={`dropzone ${over ? "over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <input type="file" multiple accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={(e) => addFiles(e.target.files)} />
        <div className="dz-icon">{Icon.upload}</div>
        <div style={{ fontWeight: 600 }}>Drop your assignment, rubric, or syllabus here</div>
        <div className="muted small">or click to browse · PDF, TXT, or MD · under 4 MB total</div>
      </label>
      {files.length > 0 ? (
        <div className="file-chips">
          {files.map((f) => (
            <span className="pill blue" key={f.name}>
              <span style={{ width: 14, height: 14, display: "inline-flex" }}>{Icon.file}</span>
              {f.name}
              <button type="button" className="ghost sm" style={{ padding: "0 0.2rem", color: "inherit" }} aria-label={`Remove ${f.name}`} onClick={() => setFiles((all) => all.filter((x) => x !== f))}>
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid2" style={{ marginTop: "1rem" }}>
        <label className="field">
          Project name <span className="muted" style={{ fontWeight: 400 }}>optional, the agent finds it</span>
          <input placeholder="BUS 3394 Group Project" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Due date <span className="muted" style={{ fontWeight: 400 }}>optional override</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      </div>

      <h2 className="h2">
        <span className="section-num">2</span>Your team
      </h2>
      <div className="stack">
        {team.map((p, i) => (
          <div className="member-card" key={i}>
            <div className="spread">
              <div className="row">
                <Avatar name={p.name || p.email || `Teammate ${i + 1}`} size="lg" />
                <strong>{p.name || `Teammate ${i + 1}`}</strong>
                {i === 0 ? <span className="pill gray">You</span> : null}
              </div>
              {i > 0 ? (
                <button type="button" className="ghost sm" onClick={() => setTeam((t) => t.filter((_, j) => j !== i))}>
                  Remove
                </button>
              ) : null}
            </div>
            <div className="grid2">
              <label className="field">
                Name
                <input placeholder="Full name" value={p.name} onChange={(e) => update(i, { name: e.target.value })} />
              </label>
              <label className="field">
                Email <span className="muted" style={{ fontWeight: 400 }}>they sign in with this</span>
                <input type="email" placeholder="name@example.com" value={p.email} onChange={(e) => update(i, { email: e.target.value })} />
              </label>
            </div>
            <div className="grid2">
              <label className="field">
                Skills
                <textarea rows={2} placeholder="Strong writer, good with diagrams…" value={p.skills_text} onChange={(e) => update(i, { skills_text: e.target.value })} />
              </label>
              <label className="field">
                Preferences
                <textarea rows={2} placeholder="Prefers writing, avoids presenting…" value={p.prefs_text} onChange={(e) => update(i, { prefs_text: e.target.value })} />
              </label>
            </div>
            <label className="field" style={{ maxWidth: 200 }}>
              Hours per week
              <input type="number" min={0} max={80} value={p.weekly_hours} onChange={(e) => update(i, { weekly_hours: Number(e.target.value) })} />
            </label>
          </div>
        ))}
        <button type="button" className="ghost" style={{ justifySelf: "start" }} onClick={() => setTeam((t) => [...t, blank()])}>
          {Icon.plus} Add a teammate
        </button>
      </div>

      <div className="divider" />

      <div className="row">
        <button className="primary big" type="submit" disabled={running}>
          <span style={{ width: 18, height: 18, display: "inline-flex" }}>{Icon.sparkle}</span>
          {running ? "Agent is setting things up…" : "Create project and draft the plan"}
        </button>
        {!started ? <span className="muted small">Takes about a minute. You can watch it work.</span> : null}
      </div>

      {started ? <AgentActivity title="Setting up your project" working={running} failed={Boolean(error)} items={items} /> : null}

      {error ? (
        <p className="error" role="alert" style={{ marginTop: "0.6rem" }}>
          {error}
        </p>
      ) : null}

      {done ? (
        <div className="callout blue fade-in">
          <div className="callout-icon">{Icon.sparkle}</div>
          <div className="callout-body">
            <div className="callout-title">Your plan is ready: {done.stepCount} steps</div>
            <p className="muted" style={{ marginBottom: "0.5rem" }}>
              {done.passed ? "It passed every manageability check." : "A few checks need a look before you approve."}
            </p>
            <Link className="link" href="/">
              Open your project →
            </Link>
          </div>
        </div>
      ) : null}
    </form>
  );
}
