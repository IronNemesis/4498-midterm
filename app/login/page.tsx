import { Suspense } from "react";
import { signIn } from "../actions";

async function LoginError({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { error } = await searchParams;
  return error ? (
    <p className="error" role="alert">
      That email and password didn&apos;t match. Try again.
    </p>
  ) : null;
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <main className="login-wrap">
      <div className="login-card">
        <div className="row" style={{ gap: "0.7rem" }}>
          <span className="logo" style={{ width: 34, height: 34, fontSize: 14, borderRadius: 8 }}>TT</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Team Tank</div>
            <div className="muted small">Group projects, broken into steps that get done.</div>
          </div>
        </div>
        <form action={signIn} className="stack">
          <label className="field">
            Email
            <input name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
          </label>
          <label className="field">
            Password
            <input name="password" type="password" placeholder="Your password" autoComplete="current-password" required />
          </label>
          <button className="primary big" type="submit" style={{ justifyContent: "center", marginTop: "0.3rem" }}>
            Sign in
          </button>
          <Suspense>
            <LoginError searchParams={props.searchParams} />
          </Suspense>
        </form>
      </div>
    </main>
  );
}
