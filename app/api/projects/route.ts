import { db } from "@/lib/supabase";
import { currentMember, unauthorized } from "@/lib/auth";

// GET /api/projects: the signed-in member's project with its members, criteria, and steps.
// Projects are created through POST /api/projects/create.
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
