// POST /api/steps/:id/checkin
// Records a check-in. A blocked or behind status is Trigger B and runs T4, then T3, then saves a replan proposal for H2.
//   T4: Claude with read-only tools (get_task, get_checkin_history, get_member_load, get_dependencies),
//       hard cap of 5 tool calls and 60 seconds, every call written to agent_tool_calls for the trace UI.
export async function POST(_request: Request, ctx: RouteContext<"/api/steps/[id]/checkin">) {
  const { id } = await ctx.params;
  return Response.json({ error: "Not implemented: check-in and T4", step_id: id }, { status: 501 });
}
