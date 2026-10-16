import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { signOut } from "@/app/actions";
import { currentUser } from "@/lib/auth";
import { Avatar, Icon } from "./ui";

async function UserChip() {
  const user = await currentUser();
  if (!user) return null;
  return (
    <div className="user-chip">
      <Avatar name={user.email} />
      <span>{user.email}</span>
    </div>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="workspace">
          <span className="logo">TT</span>
          Team Tank
        </div>
        <div className="nav-label">Workspace</div>
        <Link className="nav-item" href="/">
          {Icon.home}
          My project
        </Link>
        <Link className="nav-item" href="/new">
          {Icon.plus}
          New project
        </Link>
        <div className="sidebar-foot">
          <Suspense fallback={null}>
            <UserChip />
          </Suspense>
          <form action={signOut}>
            <button className="nav-item" type="submit">
              {Icon.logout}
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
