import Link from "next/link";
import { currentMember } from "@/lib/auth";
import { db } from "@/lib/supabase";
import type { ManageabilityReport } from "@/lib/types";
import type { Change } from "@/lib/replan";
import ApproveButtons from "./ApproveButtons";
import CheckIn from "./CheckIn";
import { Avatar, Callout, formatDate, Icon, initials, Person, StatusPill, Tag } from "./ui";

interface Row {
  id?: string;
  title: string;
  criterion: string;
  hours: number;
  due_date: string | null;
  owner: string;
  why: string | null;
  status?: string;
  mine?: boolean;
}

function Checks({ report }: { report: ManageabilityReport }) {
  return (
    <div className="checks">
      {report.checks.map((c) => (
        <div key={c.id} className="check">
          <span className={`check-mark ${c.passed ? "ok" : "fail"}`}>{c.passed ? "✓" : "!"}</span>
          <div>
            <div>{c.name}</div>
            {!c.passed ? (
              <div className="muted small">
                {c.details.slice(0, 4).join("; ")}
                {c.details.length > 4 ? ` and ${c.details.length - 4} more` : ""}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function PlanTables({ rows, live }: { rows: Row[]; live?: boolean }) {
  const owners = [...new Set(rows.map((r) => r.owner))];
  return (
    <>
      {owners.map((owner) => {
        const list = rows.filter((r) => r.owner === owner).sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
        const hours = list.reduce((s, r) => s + r.hours, 0);
        return (
          <section key={owner}>
            <div className="group-head">
              <Avatar name={owner} />
              {owner}
              <span className="count">
                {list.length} steps · {hours}h
              </span>
            </div>
            <div className="db">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "42%" }}>Step</th>
                    <th>Criterion</th>
                    <th>Hours</th>
                    <th>Due</th>
                    {live ? <th>Status</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {list.map((r, i) => (
                    <tr key={r.id ?? i} className={r.status === "done" ? "is-done" : ""}>
                      <td>
                        <div className="step-title">{r.title}</div>
                        {r.why ? <div className="step-why">{r.why}</div> : null}
                      </td>
                      <td>
                        <Tag text={r.criterion} />
                      </td>
                      <td className="muted">{r.hours}h</td>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>
                        {formatDate(r.due_date)}
                      </td>
                      {live ? (
                        <td>
                          <div className="stack" style={{ gap: "0.4rem" }}>
                            <StatusPill status={r.status} />
                            {r.mine && r.id && r.status !== "done" ? <CheckIn stepId={r.id} stepTitle={r.title} status={r.status} /> : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}

function Progress({ rows, people }: { rows: Row[]; people: string[] }) {
  const total = rows.reduce((s, r) => s + r.hours, 0);
  const done = rows.filter((r) => r.status === "done").reduce((s, r) => s + r.hours, 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const doneSteps = rows.filter((r) => r.status === "done").length;
  return (
    <div className="card progress-card">
      <div className="progress-top">
        <div>
          <div className="muted small" style={{ fontWeight: 600 }}>Total project progress</div>
          <div className="muted small">
            {doneSteps} of {rows.length} steps · {done} of {total} hours
          </div>
        </div>
        <div className="progress-pct">{pct}%</div>
      </div>
      <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Total project progress">
        <div className={`bar-fill ${pct === 100 ? "green" : ""}`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <div className="people-progress">
        {people.map((p) => {
          const mine = rows.filter((r) => r.owner === p);
          const t = mine.reduce((s, r) => s + r.hours, 0);
          const d = mine.filter((r) => r.status === "done").reduce((s, r) => s + r.hours, 0);
          const pp = t ? Math.round((d / t) * 100) : 0;
          return (
            <div className="person-progress" key={p}>
              <div className="spread small">
                <Person name={p} />
                <span className="muted">{pp}%</span>
              </div>
              <div className="bar thin">
                <div className="bar-fill" style={{ width: `${Math.max(pp, 2)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default async function Dashboard() {
  const me = await currentMember();
  if (!me) {
    return (
      <div className="page">
        <div className="cover" />
        <div className="page-icon">TT</div>
        <h1 className="page-title">Welcome to Team Tank</h1>
        <p className="page-sub">You&apos;re not on a project yet.</p>
        <Callout tone="blue" icon={Icon.sparkle} title="Start your first project">
          <p className="muted" style={{ marginBottom: "0.6rem" }}>
            Upload your assignment and add your team. The agent sets up the project and drafts a plan of small steps, each with an owner and a date.
          </p>
          <Link className="link" href="/new">
            Create a project →
          </Link>
        </Callout>
      </div>
    );
  }

  const projectId = me.member.project_id;
  const [{ data: project }, { data: members }, { data: criteria }, { data: steps }, { data: proposals }] = await Promise.all([
    db().from("projects").select("*").eq("id", projectId).single(),
    db().from("members").select("*").eq("project_id", projectId).order("created_at"),
    db().from("criteria").select("*").eq("project_id", projectId).order("position"),
    db().from("steps").select("*").eq("project_id", projectId).eq("deferred", false),
    db().from("plan_proposals").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
  ]);
  if (!project) return <div className="page plain-head">Couldn&apos;t load your project.</div>;

  const nameOf = new Map((members ?? []).map((m) => [m.id as string, m.name as string]));
  const criterionTitle = new Map((criteria ?? []).map((c) => [c.id as string, c.title as string]));
  const stepTitle = new Map((steps ?? []).map((s) => [s.id as string, s.title as string]));
  const isOpen = (p: { status: string }) => p.status === "pending" || p.status === "failed_checks";
  const kickoff = (proposals ?? []).find((p) => p.kind === "kickoff");
  const replan = (proposals ?? []).find((p) => p.kind === "replan" && isOpen(p));

  const [{ data: trace }, { data: decisions }] = replan
    ? await Promise.all([
        db().from("agent_tool_calls").select("seq, tool_name, rationale, tool_output").eq("run_id", replan.agent_run_id).order("seq"),
        db().from("proposal_decisions").select("member_id, decision").eq("proposal_id", replan.id),
      ])
    : [{ data: [] }, { data: [] }];

  const kickoffOpen = kickoff && isOpen(kickoff);
  const planned = (kickoff?.payload?.steps ?? []) as { title: string; criterion: string; hours: number; due_date: string; owner_id: string | null; why_owner: string }[];
  const proposedRows: Row[] = planned.map((s) => ({
    title: s.title,
    criterion: s.criterion,
    hours: Number(s.hours),
    due_date: s.due_date,
    owner: (s.owner_id && nameOf.get(s.owner_id)) || "Unassigned",
    why: s.why_owner,
  }));
  const liveRows: Row[] = (steps ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    criterion: criterionTitle.get(s.criterion_id) ?? "",
    hours: Number(s.hours),
    due_date: s.due_date,
    owner: nameOf.get(s.owner_id) ?? "Unassigned",
    why: s.why_owner,
    status: s.status,
    mine: s.owner_id === me.member.id,
  }));
  const next = liveRows.filter((r) => r.mine && r.status !== "done").sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")).slice(0, 3);

  const affected: string[] = replan?.payload?.affected_member_ids ?? [];
  const decided = new Map((decisions ?? []).map((d) => [d.member_id as string, d.decision as string]));
  const canDecide = replan && affected.includes(me.member.id) && !decided.has(me.member.id);
  const daysLeft = Math.ceil((Date.parse(`${project.due_date}T23:59:59Z`) - Date.now()) / 86_400_000);
  const people = (members ?? []).map((m) => m.name as string);

  return (
    <div className="page fade-in">
      <div className="cover" />
      <div className="page-icon">{initials(project.name) || "TT"}</div>
      <h1 className="page-title">{project.name}</h1>

      <div className="props">
        <div className="prop">
          <div className="prop-key">{Icon.calendar}Due</div>
          <div className="prop-val">
            {formatDate(project.due_date)}
            <span className={`pill ${daysLeft <= 7 ? "red" : daysLeft <= 21 ? "orange" : "gray"}`}>{daysLeft >= 0 ? `${daysLeft} days left` : "Past due"}</span>
          </div>
        </div>
        <div className="prop">
          <div className="prop-key">{Icon.users}Team</div>
          <div className="prop-val">
            {(members ?? []).map((m) => (
              <span key={m.id} className="person-tag" style={{ marginRight: "0.6rem" }}>
                <Avatar name={m.name} />
                {m.name}
                <span className="muted small">{m.weekly_hours}h/wk</span>
              </span>
            ))}
          </div>
        </div>
        {Array.isArray(project.milestones) && project.milestones.length > 0 ? (
          <div className="prop">
            <div className="prop-key">{Icon.flag}Milestones</div>
            <div className="prop-val">
              {project.milestones.map((m: { title: string; date: string }) => (
                <span key={m.title} className="pill purple" title={m.title}>
                  {formatDate(m.date)} · {m.title.length > 38 ? `${m.title.slice(0, 38)}…` : m.title}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        <div className="prop">
          <div className="prop-key">{Icon.target}Criteria</div>
          <div className="prop-val">
            {(criteria ?? []).map((c) => (
              <Tag key={c.id} text={`${c.title} · ${c.points}`} />
            ))}
          </div>
        </div>
      </div>

      {project.summary ? <p className="muted" style={{ marginTop: "0.6rem" }}>{project.summary}</p> : null}
      <div className="divider" />

      {replan ? (
        <div className="callout purple fade-in">
          <div className="callout-icon">{Icon.route}</div>
          <div className="callout-body">
            <div className="callout-title">
              The agent proposed a re-plan {replan.status === "failed_checks" ? <span className="pill red" style={{ marginLeft: 6 }}>fails some checks</span> : null}
            </div>
            <p style={{ marginBottom: "0.4rem" }}>
              <strong>Diagnosis:</strong> {replan.payload.diagnosis}
            </p>
            <p className="muted">{replan.justification}</p>

            <div className="h3">What the agent checked</div>
            <ul className="timeline" style={{ padding: 0 }}>
              {(trace ?? []).map((t) => (
                <li key={t.seq}>
                  <span className="tl-mark num">{t.seq}</span>
                  <div className="tl-body">
                    <div>{t.rationale || t.tool_name}</div>
                    <div className="tl-detail">
                      <code>{t.tool_name}</code>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="h3">Proposed changes</div>
            <div className="stack" style={{ gap: "0.4rem" }}>
              {(replan.payload.changes as Change[]).map((c, i) => (
                <div key={i} className="check">
                  <span className="pill blue">{c.action.replace("_", " ")}</span>
                  <div>
                    {c.action === "split" ? `"${stepTitle.get(c.step_id) ?? "Step"}" → ${c.new_steps.map((n) => `${n.title} (${n.hours}h, ${nameOf.get(n.owner_id) ?? "?"}, ${formatDate(n.due_date)})`).join("; ")}` : null}
                    {c.action === "reassign" ? `"${stepTitle.get(c.step_id) ?? "Step"}" → ${nameOf.get(c.new_owner_id ?? "") ?? "?"}` : null}
                    {c.action === "move_date" ? `"${stepTitle.get(c.step_id) ?? "Step"}" → ${formatDate(c.new_due_date)}` : null}
                    {c.action === "defer" ? `Defer "${stepTitle.get(c.step_id) ?? "Step"}"` : null}
                    <div className="muted small">{c.reason}</div>
                  </div>
                </div>
              ))}
            </div>

            <Checks report={replan.check_results as ManageabilityReport} />
            <div className="row small" style={{ marginBottom: "0.4rem" }}>
              <span className="muted">Needs:</span>
              {affected.map((id) => (
                <span key={id} className={`pill ${decided.get(id) === "accept" ? "green" : "gray"}`}>
                  {nameOf.get(id)} · {decided.get(id) === "accept" ? "accepted" : "waiting"}
                </span>
              ))}
            </div>
            {canDecide ? <ApproveButtons proposalId={replan.id} acceptLabel="Accept re-plan" /> : null}
          </div>
        </div>
      ) : null}

      {kickoffOpen ? (
        <>
          <Callout
            tone={kickoff.status === "pending" ? "blue" : "yellow"}
            icon={kickoff.status === "pending" ? Icon.sparkle : Icon.alert}
            title={kickoff.status === "pending" ? `Your plan is ready: ${planned.length} steps` : "Some checks failed. Take a look before approving"}
          >
            <Checks report={kickoff.check_results as ManageabilityReport} />
            {kickoff.justification ? (
              <details style={{ marginBottom: "0.6rem" }}>
                <summary className="muted small" style={{ cursor: "pointer" }}>
                  Agent notes ({kickoff.justification.split("\n").length})
                </summary>
                <ul style={{ margin: "0.4rem 0 0 1.1rem" }} className="muted small">
                  {kickoff.justification.split("\n").map((f: string, i: number) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </details>
            ) : null}
            <ApproveButtons proposalId={kickoff.id} acceptLabel={kickoff.status === "pending" ? "Approve plan" : "Approve anyway"} />
          </Callout>
          <h2 className="h2">Proposed plan</h2>
          <PlanTables rows={proposedRows} />
        </>
      ) : null}

      {!kickoffOpen && liveRows.length > 0 ? (
        <>
          <Progress rows={liveRows} people={people} />

          <h2 className="h2">Your next steps</h2>
          {next.length > 0 ? (
            next.map((r) => (
              <div className="todo" key={r.id}>
                <span className="todo-box" />
                <div className="todo-main">
                  <div className="spread">
                    <div>
                      <span className="step-title">{r.title}</span> <span className="muted small">· {r.hours}h · due {formatDate(r.due_date)}</span>
                    </div>
                    <CheckIn stepId={r.id!} stepTitle={r.title} status={r.status} />
                  </div>
                  <div className="row small" style={{ marginTop: "0.25rem" }}>
                    <StatusPill status={r.status} />
                    <Tag text={r.criterion} />
                    {r.why ? <span className="muted">{r.why}</span> : null}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <Callout tone="blue" icon={Icon.check} title="You're all caught up">
              <span className="muted">Nothing left on your list. Nice work.</span>
            </Callout>
          )}

          <h2 className="h2">Plan</h2>
          <PlanTables rows={liveRows} live />
        </>
      ) : null}

      {!kickoffOpen && liveRows.length === 0 && !replan ? (
        <Callout tone="yellow" icon={Icon.info} title="No approved plan yet">
          <Link className="link" href="/new">
            Create a project →
          </Link>
        </Callout>
      ) : null}
    </div>
  );
}
