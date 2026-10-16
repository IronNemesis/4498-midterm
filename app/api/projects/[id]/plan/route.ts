// POST /api/projects/:id/plan
// Trigger A, tasks T2 and T3.
//   1. T1: load the project, members, and rubric.
//   2. T2: one Claude call with the rubric-to-step-plan skill as the system prompt (lib/skill.ts), JSON output.
//   3. T3: checkManageability (lib/manageability.ts). On failure, retry T2 once with the failed checks.
//   4. Save a plan_proposals row (status pending, or failed_checks) and return it for H1.
export async function POST(_request: Request, ctx: RouteContext<"/api/projects/[id]/plan">) {
  const { id } = await ctx.params;
  return Response.json({ error: "Not implemented: T2 and T3", project_id: id }, { status: 501 });
}
