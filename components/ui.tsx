import type { ReactNode } from "react";

const AVATAR_COLORS = ["#2383e2", "#9065b0", "#d9730d", "#448361", "#c14c8a", "#cb912f", "#337ea9", "#d44c47"];
const TAG_COLORS = ["blue", "purple", "orange", "green", "pink", "yellow", "red", "gray"] as const;

function hash(text: string) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export const tagColor = (text: string) => TAG_COLORS[hash(text) % TAG_COLORS.length];

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export function Avatar({ name, size }: { name: string; size?: "lg" }) {
  return (
    <span className={`avatar ${size ?? ""}`} style={{ background: AVATAR_COLORS[hash(name) % AVATAR_COLORS.length] }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function Person({ name }: { name: string }) {
  return (
    <span className="person-tag">
      <Avatar name={name} />
      {name}
    </span>
  );
}

const STATUS: Record<string, { label: string; color: string }> = {
  todo: { label: "Not started", color: "gray" },
  in_progress: { label: "In progress", color: "blue" },
  done: { label: "Done", color: "green" },
  blocked: { label: "Blocked", color: "red" },
  behind: { label: "Behind", color: "orange" },
};

export function StatusPill({ status }: { status?: string }) {
  const s = STATUS[status ?? "todo"] ?? STATUS.todo;
  return (
    <span className={`pill ${s.color}`}>
      <span className="dot" />
      {s.label}
    </span>
  );
}

export function Tag({ text }: { text: string }) {
  if (!text) return null;
  return <span className={`pill ${tagColor(text)}`}>{text}</span>;
}

export function formatDate(d?: string | null) {
  if (!d) return "";
  const t = new Date(`${d}T12:00:00Z`);
  return t.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function Callout({ tone, icon, title, children }: { tone?: "blue" | "yellow" | "red" | "purple"; icon: ReactNode; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={`callout ${tone ?? ""}`}>
      <div className="callout-icon">{icon}</div>
      <div className="callout-body">
        {title ? <div className="callout-title">{title}</div> : null}
        {children}
      </div>
    </div>
  );
}

const svg = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
);

export const Icon = {
  home: svg(<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />),
  plus: svg(<path d="M12 5v14M5 12h14" />),
  logout: svg(<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3" />),
  calendar: svg(<><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9.5h18M8 3v3M16 3v3" /></>),
  users: svg(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M21.5 20a6.5 6.5 0 0 0-4-6" /></>),
  flag: svg(<path d="M5 21V4M5 4h11l-2 4 2 4H5" />),
  file: svg(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>),
  upload: svg(<><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>),
  sparkle: svg(<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />),
  info: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>),
  alert: svg(<><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>),
  route: svg(<><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16" /></>),
  check: svg(<path d="M5 12.5l4.5 4.5L19 7" />),
  target: svg(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>),
  trash: svg(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />),
};
