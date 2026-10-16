"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface TraceItem {
  seq: number;
  tool: string;
  rationale?: string;
  status: string;
  summary?: string;
}

interface StageItem {
  id: string;
  status: string;
  label: string;
  detail?: string;
}

export default function CheckIn({ stepId }: { stepId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "blocked" | "behind">("idle");
  const [note, setNote] = useState("");
  const [hours, setHours] = useState(0);
  const [busy, setBusy] = useState(false);
  const [trace, setTrace] = useState<TraceItem[]>([]);
  const [stages, setStages] = useState<StageItem[]>([]);
  const [error, setError] = useState("");

  async function send(status: "in_progress" | "done" | "blocked" | "behind") {
    if ((status === "blocked" || status === "behind") && !note.trim()) return setError("Add a short note so the agent knows what happened.");
    setBusy(true);
    setError("");
    setTrace([]);
    setStages([]);
    try {
      const res = await fetch(`/api/steps/${stepId}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note, hours_logged: hours }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      if (res.headers.get("Content-Type")?.includes("ndjson") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines.filter(Boolean)) {
            const e = JSON.parse(line);
            if (e.type === "tool") setTrace((t) => [...t.filter((x) => x.seq !== e.seq), e].sort((a, b) => a.seq - b.seq));
            if (e.type === "stage") setStages((s) => [...s.filter((x) => x.id !== e.id), e]);
            if (e.type === "error") setError(e.message);
          }
        }
      }
      setMode("idle");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
        <button disabled={busy} onClick={() => send("in_progress")}>Started</button>
        <button disabled={busy} onClick={() => send("done")}>Done</button>
        <button disabled={busy} onClick={() => setMode("behind")}>Behind</button>
        <button disabled={busy} onClick={() => setMode("blocked")}>Blocked</button>
      </div>
      {mode !== "idle" ? (
        <div className="grid" style={{ marginTop: "0.5rem" }}>
          <textarea rows={2} placeholder="What happened? For example: the data is messier than expected, and I have two midterms this week" value={note} onChange={(e) => setNote(e.target.value)} />
          <label className="muted">
            Hours spent so far: <input type="number" min={0} max={40} step={0.5} style={{ width: "5rem" }} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
          </label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="primary" disabled={busy} onClick={() => send(mode)}>
              {busy ? "Agent is investigating…" : `Mark ${mode} and ask the agent to re-plan`}
            </button>
            <button disabled={busy} onClick={() => setMode("idle")}>Cancel</button>
          </div>
        </div>
      ) : null}
      {trace.length > 0 || stages.length > 0 ? (
        <div className="card" style={{ marginTop: "0.5rem" }} aria-live="polite">
          <strong>Investigation trace</strong>
          {trace.map((t) => (
            <div className="stage" key={t.seq}>
              <span className="badge">{t.seq}</span>
              <div>
                <code>{t.tool}</code> {t.status === "running" ? <span className="muted">running…</span> : null}
                {t.rationale ? <div className="muted">Why: {t.rationale}</div> : null}
                {t.summary ? <div>{t.summary}</div> : null}
              </div>
            </div>
          ))}
          {stages.map((s) => (
            <div className="stage" key={s.id}>
              <span className={`badge ${s.status === "done" ? "ok" : s.status === "error" ? "bad" : ""}`}>{s.status === "running" ? "working" : s.status}</span>
              <div>
                {s.label}
                {s.detail ? <div className="muted">{s.detail}</div> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {error ? <p className="bad" role="alert">{error}</p> : null}
    </div>
  );
}
