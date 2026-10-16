import { Suspense } from "react";
import { signIn } from "../actions";

async function LoginError({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { error } = await searchParams;
  return error ? <p role="alert">That email and password didn&apos;t match. Try again.</p> : null;
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <main style={{ maxWidth: 360, margin: "4rem auto", padding: "0 1rem", fontFamily: "var(--font-geist-sans), sans-serif" }}>
      <h1>Team Tank</h1>
      <p>Sign in to see your team&apos;s plan.</p>
      <form action={signIn} style={{ display: "grid", gap: "0.75rem" }}>
        <input name="email" type="email" placeholder="you@calpoly.edu" autoComplete="email" required />
        <input name="password" type="password" placeholder="Password" autoComplete="current-password" required />
        <button type="submit">Sign in</button>
        <Suspense>
          <LoginError searchParams={props.searchParams} />
        </Suspense>
      </form>
    </main>
  );
}
