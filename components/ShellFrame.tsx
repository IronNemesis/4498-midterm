"use client";

import { useEffect, useState, type ReactNode } from "react";

const KEY = "tt-sidebar-collapsed";

// Client wrapper for the app shell: owns the collapsed state (remembered per browser) and the ⌘\ / Ctrl+\ shortcut.
export default function ShellFrame({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(KEY) === "1");
    } catch {
      // Storage unavailable: start expanded.
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function toggle() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(KEY, c ? "0" : "1");
      } catch {
        // Not persisted; fine.
      }
      return !c;
    });
  }

  return (
    <div className={`shell ${collapsed ? "collapsed" : ""}`}>
      <aside className="sidebar" aria-hidden={collapsed} inert={collapsed}>
        <button className="sidebar-toggle ghost sm" onClick={toggle} aria-label="Collapse sidebar" title="Collapse sidebar (⌘\)">
          «
        </button>
        {sidebar}
      </aside>
      {collapsed ? (
        <button className="sidebar-open" onClick={toggle} aria-label="Open sidebar" title="Open sidebar (⌘\)">
          »
        </button>
      ) : null}
      <main className="main">{children}</main>
    </div>
  );
}
