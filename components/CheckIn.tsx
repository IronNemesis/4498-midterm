"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AgentActivity, { type ActivityItem } from "./AgentActivity";
import { celebrate } from "./celebrate";

type Status = "in_progress" | "done" | "blocked" | "behind";

export default function CheckIn({ stepId, stepTitle, status }: { stepId: string; stepTitle: string; status?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"behind" | "blocked">("behind");
  const [note, setNote] = useState("");
  const [hours, setHours] = useState(0);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState(false);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [error, setError] = useState("");
  const [finished, setFinished] = useState(false);

  const upsert = (item: ActivityItem) => setItems((prev) => (prev.some((p) => p.key === item.key) ? prev.map((p) => (p.key === item.key ? item : p)) : [...prev, item]));

  async function send(next: Status) {
    if ((next === "blocked" || next === "behind") && !note.trim()) return setError("Add a short note so the agent knows what happened.");
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/steps/${stepId}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, note, hours_logged: hours }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      if (next === "done") celebrate();
      if (res.headers.get("Content-Type")?.includes("ndjson") && res.body) {
        setWorking(true);
        setItems([]);
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
            if (e.type === "tool") {
              upsert({ key: `tool-${e.seq}`, status: "tool", badge: e.seq, label: e.rationale || `Calling ${e.tool}`, detail: e.summary ? `${e.tool} → ${e.summary}` : `${e.tool}…` });
            } else if (e.type === "stage") {
              upsert({ key: `stage-${e.id}`, status: e.status, label: e.label, detail: e.detail || undefined });
            } else if (e.type === "error") {
              setError(e.message);
            }
          }
        }
        setWorking(false);
        setFinished(true);
      } else {
        setOpen(false);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setWorking(false);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (working) return;
    setOpen(false);
    setItems([]);
    setFinished(false);
    setNote("");
    setError("");
  }

  return (
    <>
      <div className="row" style={{ gap: "0.35rem" }}>
        <button className="done-btn sm" disabled={busy} onClick={() => send("done")}>
          I&apos;m done!
        </button>
        {status === "todo" ? (
          <button className="ghost sm" disabled={busy} onClick={() => send("in_progress")}>
            Start
          </button>
        ) : null}
        <button className="ghost sm" disabled={busy} onClick={() => setOpen(true)}>
          Stuck?
        </button>
      </div>
      {error && !open ? (
        <p className="error small" role="alert">
          {error}
        </p>
      ) : null}

      {open ? (
        <div className="modal-backdrop" onClick={close}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Report a slip" onClick={(e) => e.stopPropagation()}>
            <div className="spread" style={{ marginBottom: "0.9rem" }}>
              <div>
                <div className="muted small">Report a slip</div>
                <div style={{ fontWeight: 600, fontSize: 17 }}>{stepTitle}</div>
              </div>
              <button className="ghost sm" onClick={close} disabled={working} aria-label="Close">
                ✕
              </button>
            </div>

            {items.length === 0 && !working ? (
              <div className="stack">
                <div className="segmented" role="radiogroup" aria-label="What happened">
                  <button className={kind === "behind" ? "on" : ""} onClick={() => setKind("behind")} role="radio" aria-checked={kind === "behind"}>
                    I&apos;m behind
                  </button>
                  <button className={kind === "blocked" ? "on" : ""} onClick={() => setKind("blocked")} role="radio" aria-checked={kind === "blocked"}>
                    I&apos;m blocked
                  </button>
                </div>
                <label className="field">
                  What happened?
                  <textarea rows={3} placeholder="For example: the data is messier than expected, and I have two midterms this week" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
                </label>
                <label className="field" style={{ maxWidth: 200 }}>
                  Hours spent so far
                  <input type="number" min={0} max={40} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
                </label>
                <p className="muted small">The agent will look into what&apos;s going on and propose a fix. Nothing changes until the people affected accept it.</p>
                <div className="row">
                  <button className="primary" disabled={busy} onClick={() => send(kind)}>
                    Ask the agent to re-plan
                  </button>
                  <button className="ghost" onClick={close}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <AgentActivity title="Investigating the slip" working={working} failed={Boolean(error)} items={items} />
            )}

            {error ? (
              <p className="error" role="alert" style={{ marginTop: "0.6rem" }}>
                {error}
              </p>
            ) : null}
            {finished ? (
              <div className="row" style={{ marginTop: "0.6rem" }}>
                <button className="primary" onClick={close}>
                  See the proposal
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
