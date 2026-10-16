import { z } from "zod";
import { db } from "@/lib/supabase";
import { currentMember, unauthorized } from "@/lib/auth";

const SetupSchema = z.object({
  name: z.string().min(1),
  rubric_text: z.string().min(1),
  due_date: z.iso.date(),
  members: z
    .array(
      z.object({
        name: z.string().min(1),
        skills_text: z.string().default(""),
        prefs_text: z.string().default(""),
        weekly_hours: z.number().min(0),
      }),
    )
    .min(1),
});

// POST /api/projects: kickoff setup (Trigger A, T1 input). Creates the project and its members.
export async function POST(request: Request) {
  if (!(await currentMember())) return unauthorized();
  const parsed = SetupSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const { members, ...project } = parsed.data;

  const { data: created, error } = await db().from("projects").insert(project).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { error: memberError } = await db()
    .from("members")
    .insert(members.map((m) => ({ ...m, project_id: created.id })));
  if (memberError) return Response.json({ error: memberError.message }, { status: 500 });

  return Response.json({ id: created.id }, { status: 201 });
}

// GET /api/projects: the signed-in member's project with its members, criteria, and steps.
export async function GET() {
  const me = await currentMember();
  if (!me) return unauthorized();
  const { data: project, error } = await db()
    .from("projects")
    .select("*, members(*), criteria(*), steps(*)")
    .eq("id", me.member.project_id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ project });
}
