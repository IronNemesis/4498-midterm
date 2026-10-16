"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { celebrate } from "./celebrate";

interface Props {
  proposalId: string;
  acceptLabel: string;
  declineLabel?: string;
}

export default function ApproveButtons({ proposalId, acceptLabel, declineLabel = "Decline" }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function decide(decision: "accept" | "decline") {
    setBusy(true);
    setMessage("");
    const res = await fetch(`/api/proposals/${proposalId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage(j.error ?? `Request failed (${res.status})`);
    if (j.status === "approved") celebrate(false);
    if (j.status === "waiting") setMessage("You're in. Waiting on your teammate to accept.");
    router.refresh();
  }

  return (
    <div className="row" style={{ marginTop: "0.4rem" }}>
      <button className="primary" disabled={busy} onClick={() => decide("accept")}>
        {busy ? "Saving…" : acceptLabel}
      </button>
      <button className="ghost" disabled={busy} onClick={() => decide("decline")}>
        {declineLabel}
      </button>
      {message ? (
        <span className="muted small" role="status">
          {message}
        </span>
      ) : null}
    </div>
  );
}
