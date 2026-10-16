"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    if (j.status === "waiting") setMessage("Your acceptance is recorded. Waiting on your teammate.");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
      <button className="primary" disabled={busy} onClick={() => decide("accept")}>
        {acceptLabel}
      </button>
      <button disabled={busy} onClick={() => decide("decline")}>
        {declineLabel}
      </button>
      {message ? <span className="muted" role="status">{message}</span> : null}
    </div>
  );
}
