import Link from "next/link";
import { currentMember } from "@/lib/auth";
import { db } from "@/lib/supabase";
import type { ManageabilityReport } from "@/lib/types";
import type { Change } from "@/lib/replan";
import ApproveButtons from "./ApproveButtons";
import CheckIn from "./CheckIn";

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
    <div style={{ marginBottom: "0.75rem" }}>
      {report.checks.map((c) => (
        <div key={c.id} className="stage">
          <span className={`badge ${c.passed ? "ok" : "bad"}`}>{c.passed ? "pass" : "fail"}</span>
          <div>
            <div>{c.name}</div>
            {!c.passed ? (
              <div className="muted">
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

function StepTable({ rows, withCheckIn }: { rows: Row[]; withCheckIn?: boolean }) {
  const owners = [...new Set(rows.map((r) => r.owner))];
  return (
    <>
      {owners.map((owner) => {
        const list = rows.filter((r) => r.owner === owner).sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
        const hours = list.reduce((s, r) => s + r.hours, 0);
        return (
          <div key={owner} style={{ marginBottom: "1.25rem" }}>
            <h2>
              {owner} <span className="muted">· {list.length} steps · {hours}h</span>
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Step</th>
                  <th>Criterion</th>
                  <th>Hours</th>
                  <th>Due</th>
                  {withCheckIn ? <th>Status</th> : <th>Why this person</th>}
                </tr>
              </thead>
              <tbody>
                {list.map((r, i) => (
                  <tr key={r.id ?? i}>
                    <td>{r.title}</td>
                    <td className="muted">{r.criterion}</td>
                    <td>{r.hours}</td>
                    <td>{r.due_date}</td>
                    {withCheckIn ? (
                      <td>
                        <span className={`badge ${r.status === "done" ? "ok" : r.status === "blocked" || r.status === "behind" ? "bad" : ""}`}>{r.status?.replace("_", " ")}</span>
                        {r.mine && r.id && r.status !== "done" ? (
                          <div style={{ marginTop: "0.4rem" }}>
                            <CheckIn stepId={r.id} />
                          </div>
                        ) : null}
                      </td>
                    ) : (
                      <td className="muted">{r.why}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}

export default async function Dashboard() {
  const me = await currentMember();
  if (!me) {
    return (
      <div className="card">
        <h2>No project yet</h2>
        <p className="muted" style={{ marginBottom: "0.75rem" }}>
          Upload your project documents and the agent will set up the project, add your team, and draft the plan.
        </p>
        <Link className="link" href="/new">Create a project</Link>
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
  if (!project) return <p>Couldn&apos;t load your project.</p>;

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

  return (
    <>
      <div className="card">
        <h1>{project.name}</h1>
        <p className="muted">Due {project.due_date} · you are {me.member.name}</p>
        {project.summary ? <p style={{ marginTop: "0.6rem" }}>{project.summary}</p> : null}
        <p className="muted" style={{ marginTop: "0.6rem" }}>
          Team: {(members ?? []).map((m) => `${m.name} (${m.weekly_hours}h/week)`).join(", ")}
        </p>
        {Array.isArray(project.milestones) && project.milestones.length > 0 ? (
          <p className="muted" style={{ marginTop: "0.3rem" }}>
            Milestones: {project.milestones.map((m: { title: string; date: string }) => `${m.title} (${m.date})`).join("; ")}
          </p>
        ) : null}
      </div>

      {replan ? (
        <div className="card" style={{ borderColor: "var(--accent)" }}>
          <h2>Re-plan proposed {replan.status === "failed_checks" ? <span className="bad">· fails some checks</span> : null}</h2>
          <p style={{ marginBottom: "0.5rem" }}>
            <strong>Diagnosis:</strong> {replan.payload.diagnosis}
          </p>
          <p style={{ marginBottom: "0.75rem" }}>{replan.justification}</p>

          <strong>What the agent checked</strong>
          {(trace ?? []).map((t) => (
            <div className="stage" key={t.seq}>
              <span className="badge">{t.seq}</span>
              <div>
                <code>{t.tool_name}</code>
                {t.rationale ? <div className="muted">Why: {t.rationale}</div> : null}
              </div>
            </div>
          ))}

          <strong style={{ display: "block", marginTop: "0.75rem" }}>Proposed changes</strong>
          <ul style={{ margin: "0.4rem 0 0.75rem 1.2rem" }}>
            {(replan.payload.changes as Change[]).map((c, i) => (
              <li key={i}>
                {c.action === "split" ? `Split "${stepTitle.get(c.step_id) ?? c.step_id}" into: ${c.new_steps.map((n) => `${n.title} (${n.hours}h, ${nameOf.get(n.owner_id) ?? "?"}, ${n.due_date})`).join("; ")}` : null}
                {c.action === "reassign" ? `Move "${stepTitle.get(c.step_id) ?? c.step_id}" to ${nameOf.get(c.new_owner_id ?? "") ?? "?"}` : null}
                {c.action === "move_date" ? `Move "${stepTitle.get(c.step_id) ?? c.step_id}" to ${c.new_due_date}` : null}
                {c.action === "defer" ? `Defer "${stepTitle.get(c.step_id) ?? c.step_id}"` : null}
                <span className="muted"> · {c.reason}</span>
              </li>
            ))}
          </ul>

          <Checks report={replan.check_results as ManageabilityReport} />
          <p className="muted" style={{ marginBottom: "0.6rem" }}>
            Needs: {affected.map((id) => `${nameOf.get(id)} (${decided.get(id) === "accept" ? "accepted" : "waiting"})`).join(", ")}
          </p>
          {canDecide ? <ApproveButtons proposalId={replan.id} acceptLabel="Accept re-plan" /> : null}
        </div>
      ) : null}

      {kickoffOpen ? (
        <>
          <div className="card">
            <h2>{kickoff.status === "pending" ? "Plan ready for your approval" : "Plan needs a look: some checks failed"}</h2>
            <Checks report={kickoff.check_results as ManageabilityReport} />
            {kickoff.justification ? <p className="muted" style={{ marginBottom: "0.75rem", whiteSpace: "pre-line" }}>Agent flags:{"\n"}{kickoff.justification}</p> : null}
            <ApproveButtons proposalId={kickoff.id} acceptLabel={kickoff.status === "pending" ? "Approve plan" : "Approve anyway"} />
          </div>
          <StepTable rows={proposedRows} />
        </>
      ) : null}

      {!kickoffOpen && liveRows.length > 0 ? (
        <>
          {next.length > 0 ? (
            <div className="card">
              <h2>Your next steps</h2>
              {next.map((r) => (
                <div className="stage" key={r.id}>
                  <span className="badge">{r.due_date}</span>
                  <div>
                    <div>{r.title} <span className="muted">· {r.hours}h</span></div>
                    {r.why ? <div className="muted">{r.why}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <StepTable rows={liveRows} withCheckIn />
        </>
      ) : null}
      {!kickoffOpen && liveRows.length === 0 ? <p className="muted">No approved plan yet.</p> : null}
    </>
  );
}
