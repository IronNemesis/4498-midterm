import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { signOut } from "@/app/actions";
import { currentUser } from "@/lib/auth";
import ShellFrame from "./ShellFrame";
import SidebarProject from "./SidebarProject";
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

function SidebarSkeleton() {
  return (
    <div className="side-section" style={{ padding: "0 0.6rem" }}>
      <div className="skeleton" style={{ height: 40 }} />
      <div className="skeleton" />
      <div className="skeleton" style={{ width: "60%" }} />
    </div>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const sidebar = (
    <>
      <div className="workspace">
        <span className="logo">TT</span>
        Team Tank
      </div>
      <Link className="nav-item" href="/">
        {Icon.home}
        My project
      </Link>
      <Link className="nav-item" href="/new">
        {Icon.plus}
        New project
      </Link>
      <Suspense fallback={<SidebarSkeleton />}>
        <SidebarProject />
      </Suspense>
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
    </>
  );
  return <ShellFrame sidebar={sidebar}>{children}</ShellFrame>;
}
