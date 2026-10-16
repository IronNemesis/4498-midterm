// POST /api/proposals/:id/decision
// H1 (team approves the kickoff plan) and H2 (affected members accept or decline a re-plan).
// Records a proposal_decisions row. When the required members have accepted, apply the payload to steps
// and mark the proposal approved; a decline marks it declined and leaves the plan unchanged.
export async function POST(_request: Request, ctx: RouteContext<"/api/proposals/[id]/decision">) {
  const { id } = await ctx.params;
  return Response.json({ error: "Not implemented: H1 and H2 decisions", proposal_id: id }, { status: 501 });
}
