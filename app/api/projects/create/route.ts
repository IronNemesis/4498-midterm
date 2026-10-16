import { z } from "zod";
import { currentUser, unauthorized } from "@/lib/auth";
import { runCreateProject } from "@/lib/pipeline";

export const maxDuration = 300;

const TeamSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1, "Every teammate needs a name"),
      email: z.email("Every teammate needs a valid email"),
      skills_text: z.string().default(""),
      prefs_text: z.string().default(""),
      weekly_hours: z.number().min(0),
    }),
  )
  .min(1, "Add at least one teammate");

// POST /api/projects/create (multipart): documents + team. Streams newline-delimited JSON progress events
// while the agent reads the documents, sets up the project and team, drafts the plan, and checks it.
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return Response.json({ error: "Upload at least one project document." }, { status: 400 });

  let team;
  try {
    const parsed = TeamSchema.safeParse(JSON.parse(String(form.get("team") ?? "[]")));
    if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
    team = parsed.data;
  } catch {
    return Response.json({ error: "Couldn't read the team list." }, { status: 400 });
  }

  const name = String(form.get("name") ?? "").trim() || undefined;
  const dueRaw = String(form.get("due_date") ?? "").trim();
  const due_date = /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? dueRaw : undefined;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        const result = await runCreateProject({ userId: user.id, userEmail: user.email, files, team, overrides: { name, due_date }, emit });
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
