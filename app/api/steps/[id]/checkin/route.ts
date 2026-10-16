import { z } from "zod";
import { currentMember, unauthorized } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { investigateSlip } from "@/lib/investigate";

export const maxDuration = 120;

const Body = z.object({
  status: z.enum(["in_progress", "done", "blocked", "behind"]),
  note: z.string().max(1000).default(""),
  hours_logged: z.number().min(0).max(40).default(0),
});

// POST /api/steps/:id/checkin
// Records a check-in. Done or in-progress returns JSON. Blocked or behind is Trigger B: it streams the T4
// investigation (newline-delimited JSON) and ends with a re-plan proposal for the affected members (H2).
export async function POST(request: Request, ctx: RouteContext<"/api/steps/[id]/checkin">) {
  const me = await currentMember();
  if (!me) return unauthorized();
  const { id } = await ctx.params;

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: z.prettifyError(body.error) }, { status: 400 });

  const { data: step } = await db().from("steps").select("id, project_id, owner_id").eq("id", id).maybeSingle();
  if (!step || step.project_id !== me.member.project_id) return Response.json({ error: "Step not found" }, { status: 404 });

  const { data: checkin, error } = await db()
    .from("checkins")
    .insert({ step_id: id, member_id: me.member.id, ...body.data })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await db().from("steps").update({ status: body.data.status, updated_at: new Date().toISOString() }).eq("id", id);

  if (body.data.status === "done" || body.data.status === "in_progress") return Response.json({ ok: true });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        emit({ type: "stage", id: "investigate", status: "running", label: "Investigating what caused the slip" });
        const result = await investigateSlip({ projectId: step.project_id, checkinId: checkin.id, stepId: id, emit });
        emit({ type: "stage", id: "investigate", status: "done", label: `Investigated with ${result.toolCalls} tool calls` });
        emit({ type: "done", ...result });
      } catch (e) {
        emit({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
