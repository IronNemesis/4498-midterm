"use client";

import { useEffect, useState } from "react";

export interface ActivityItem {
  key: string;
  status: "running" | "done" | "error" | "tool";
  label: string;
  detail?: string;
  badge?: string | number;
}

function Elapsed({ running }: { running: boolean }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const start = performance.now() - seconds * 1000;
    const t = setInterval(() => setSeconds(Math.floor((performance.now() - start) / 1000)), 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  const s = seconds;
  return <span className="muted small" style={{ fontVariantNumeric: "tabular-nums" }}>{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`}</span>;
}

// The live "agent is working" panel: animated orb, shimmer title, timer, and a step-by-step timeline.
export default function AgentActivity({ title, working, failed, items }: { title: string; working: boolean; failed?: boolean; items: ActivityItem[] }) {
  return (
    <div className="agent-panel" aria-live="polite">
      <div className={`agent-head ${working ? "working" : ""}`}>
        <span className={`orb ${working ? "working" : failed ? "failed" : "idle"}`} />
        <div style={{ flex: 1 }}>
          <div className={`agent-title ${working ? "shimmer-text" : ""}`}>{title}</div>
          <div className="muted small">{working ? <span className="dots">Agent is working</span> : failed ? "Stopped" : "Finished"}</div>
        </div>
        <Elapsed running={working} />
      </div>
      <ul className="timeline">
        {items.map((it) => (
          <li key={it.key}>
            <span className={`tl-mark ${it.status === "tool" ? "num" : it.status}`}>
              {it.status === "done" ? "✓" : it.status === "error" ? "!" : it.status === "tool" ? it.badge : ""}
            </span>
            <div className="tl-body">
              <div>{it.label}</div>
              {it.detail ? <div className="tl-detail">{it.detail}</div> : null}
            </div>
          </li>
        ))}
        {working ? (
          <li>
            <span className="tl-mark running" />
            <div className="tl-body" style={{ maxWidth: 320 }}>
              <div className="skeleton" />
              <div className="skeleton" style={{ width: "60%" }} />
            </div>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
