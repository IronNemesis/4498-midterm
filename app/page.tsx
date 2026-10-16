import { Suspense } from "react";
import { currentMember } from "@/lib/auth";
import { signOut } from "./actions";

async function Who() {
  const me = await currentMember();
  return me ? (
    <p>
      Signed in as {me.member.name} ({me.email}).
    </p>
  ) : (
    <p>You&apos;re signed in, but no team member is linked to this account yet. Run the seed script.</p>
  );
}

export default function Home() {
  return (
    <main style={{ padding: "2rem", fontFamily: "var(--font-geist-sans), sans-serif" }}>
      <h1>Team Tank</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <Who />
      </Suspense>
      <p>Frontend not drafted yet.</p>
      <form action={signOut}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
