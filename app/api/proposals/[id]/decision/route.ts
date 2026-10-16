import { z } from "zod";
import { currentMember, unauthorized } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { applyToDb, type Change } from "@/lib/replan";

const Body = z.object({ decision: z.enum(["accept", "decline"]) });

interface PayloadStep {
  ref: string;
  criterion: string;
  title: string;
  done_when: string;
  hours: number;
  owner_id: string | null;
  due_date: string;
  depends_on: string[];
  why_owner: string;
}

// POST /api/proposals/:id/decision
// H1: a team member approves (or declines) the kickoff plan. Approval writes the steps.
// H2: every affected member must accept a re-plan before it is applied; any one of them can decline it.
export async function POST(request: Request, ctx: RouteContext<"/api/proposals/[id]/decision">) {
  const me = await currentMember();
  if (!me) return unauthorized();
  const { id } = await ctx.params;

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "decision must be accept or decline" }, { status: 400 });

  const { data: proposal } = await db().from("plan_proposals").select("*").eq("id", id).maybeSingle();
  if (!proposal || proposal.project_id !== me.member.project_id) return Response.json({ error: "Proposal not found" }, { status: 404 });
  if (proposal.status !== "pending" && proposal.status !== "failed_checks") return Response.json({ error: `Already ${proposal.status}` }, { status: 409 });

  if (proposal.kind === "replan") {
    const affected: string[] = proposal.payload.affected_member_ids ?? [];
    if (!affected.includes(me.member.id)) return Response.json({ error: "Only the teammates this re-plan affects can decide on it" }, { status: 403 });
  }

  await db().from("proposal_decisions").upsert({ proposal_id: id, member_id: me.member.id, decision: body.data.decision });

  if (body.data.decision === "decline") {
    await db().from("plan_proposals").update({ status: "declined", decided_at: new Date().toISOString() }).eq("id", id);
    return Response.json({ status: "declined" });
  }

  if (proposal.kind === "replan") {
    const affected: string[] = proposal.payload.affected_member_ids ?? [];
    const { data: decisions } = await db().from("proposal_decisions").select("member_id, decision").eq("proposal_id", id);
    const accepted = new Set((decisions ?? []).filter((d) => d.decision === "accept").map((d) => d.member_id));
    const waiting = affected.filter((m) => !accepted.has(m));
    if (waiting.length > 0) return Response.json({ status: "waiting", waiting_on: waiting });
    try {
      await applyToDb(proposal.project_id, proposal.payload.changes as Change[]);
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
    await db().from("plan_proposals").update({ status: "approved", decided_at: new Date().toISOString() }).eq("id", id);
    return Response.json({ status: "approved" });
  }

  const payloadSteps: PayloadStep[] = proposal.payload.steps;
  const { data: criteria } = await db().from("criteria").select("id, title").eq("project_id", proposal.project_id);
  const criterionId = new Map((criteria ?? []).map((c) => [c.title.trim().toLowerCase(), c.id as string]));
  const idByRef = new Map(payloadSteps.map((s) => [s.ref, crypto.randomUUID()]));

  const { error: stepError } = await db()
    .from("steps")
    .insert(
      payloadSteps.map((s) => ({
        id: idByRef.get(s.ref),
        project_id: proposal.project_id,
        criterion_id: criterionId.get(s.criterion.trim().toLowerCase()) ?? null,
        title: s.title,
        done_when: s.done_when,
        hours: s.hours,
        owner_id: s.owner_id,
        due_date: s.due_date,
        why_owner: s.why_owner,
      })),
    );
  if (stepError) return Response.json({ error: stepError.message }, { status: 500 });

  const deps = payloadSteps.flatMap((s) =>
    s.depends_on.filter((d) => idByRef.has(d)).map((d) => ({ step_id: idByRef.get(s.ref), depends_on_step_id: idByRef.get(d) })),
  );
  if (deps.length > 0) {
    const { error: depError } = await db().from("step_dependencies").insert(deps);
    if (depError) return Response.json({ error: depError.message }, { status: 500 });
  }

  await db().from("plan_proposals").update({ status: "approved", decided_at: new Date().toISOString() }).eq("id", id);
  return Response.json({ status: "approved", steps: payloadSteps.length });
}
