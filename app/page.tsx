import { Suspense } from "react";
import Link from "next/link";
import Dashboard from "@/components/Dashboard";
import { signOut } from "./actions";

export default function Home() {
  return (
    <main className="wrap">
      <div className="top">
        <strong>Team Tank</strong>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <Link className="link" href="/new">New project</Link>
          <form action={signOut}>
            <button type="submit">Sign out</button>
          </form>
        </div>
      </div>
      <Suspense fallback={<p className="muted">Loading your project…</p>}>
        <Dashboard />
      </Suspense>
    </main>
  );
}
