import Link from "next/link";
import { currentMember } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { Avatar, formatDate } from "./ui";

function Ring({ pct }: { pct: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg width="46" height="46" viewBox="0 0 46 46" className="ring" aria-hidden="true">
      <circle cx="23" cy="23" r={r} className="ring-track" />
      <circle cx="23" cy="23" r={r} className="ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      <text x="23" y="27" textAnchor="middle" className="ring-text">
        {pct}%
      </text>
    </svg>
  );
}

// Sidebar snapshot of the signed-in member's project: progress, up next, milestones, team, and page links.
export default async function SidebarProject() {
  const me = await currentMember();
  if (!me) {
    return (
      <div className="side-section">
        <div className="side-empty">
          No project yet.{" "}
          <Link className="link" href="/new">
            Create one
          </Link>
        </div>
      </div>
    );
  }

  const projectId = me.member.project_id;
  const [{ data: project }, { data: members }, { data: steps }] = await Promise.all([
    db().from("projects").select("name, due_date, milestones").eq("id", projectId).single(),
    db().from("members").select("id, name").eq("project_id", projectId).order("created_at"),
    db().from("steps").select("id, title, hours, due_date, status, owner_id").eq("project_id", projectId).eq("deferred", false),
  ]);
  if (!project) return null;

  const all = steps ?? [];
  const total = all.reduce((s, x) => s + Number(x.hours), 0);
  const done = all.filter((x) => x.status === "done").reduce((s, x) => s + Number(x.hours), 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const daysLeft = Math.ceil((Date.parse(`${project.due_date}T23:59:59Z`) - Date.now()) / 86_400_000);
  const today = new Date().toISOString().slice(0, 10);
  const upNext = all
    .filter((x) => x.owner_id === me.member.id && x.status !== "done")
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    .slice(0, 3);
  const milestones = ((project.milestones ?? []) as { title: string; date: string }[]).filter((m) => m.date >= today).slice(0, 4);

  return (
    <>
      <div className="side-section">
        <div className="nav-label">Project</div>
        <Link href="/" className="side-project">
          <Ring pct={pct} />
          <div style={{ minWidth: 0 }}>
            <div className="side-project-name">{project.name}</div>
            <div className="muted small">{daysLeft >= 0 ? `${daysLeft} days left` : "Past due"} · due {formatDate(project.due_date)}</div>
          </div>
        </Link>
      </div>

      {all.length > 0 ? (
        <div className="side-section">
          <div className="nav-label">On this page</div>
          <a className="nav-item" href="/#progress">Progress</a>
          <a className="nav-item" href="/#next">Your next steps</a>
          <a className="nav-item" href="/#plan">Plan</a>
        </div>
      ) : null}

      {upNext.length > 0 ? (
        <div className="side-section">
          <div className="nav-label">Up next for you</div>
          {upNext.map((s) => (
            <a key={s.id} href="/#next" className="side-step">
              <span className={`side-dot s-${s.status}`} />
              <span className="side-step-title">{s.title}</span>
              <span className="side-step-date">{formatDate(s.due_date)}</span>
            </a>
          ))}
        </div>
      ) : null}

      {milestones.length > 0 ? (
        <div className="side-section">
          <div className="nav-label">Milestones</div>
          <ol className="side-timeline">
            {milestones.map((m) => (
              <li key={m.title + m.date} title={m.title}>
                <span className="side-ms-date">{formatDate(m.date)}</span>
                <span className="side-ms-title">{m.title}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="side-section">
        <div className="nav-label">Team</div>
        {(members ?? []).map((m) => {
          const mine = all.filter((x) => x.owner_id === m.id);
          const d = mine.filter((x) => x.status === "done").length;
          return (
            <div key={m.id} className="side-member">
              <Avatar name={m.name} />
              <span className="side-step-title">{m.name}</span>
              <span className="side-step-date">
                {d}/{mine.length}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
