import { db } from "@/lib/supabase";
import { claude } from "@/lib/anthropic";
import { MODEL_ID } from "@/lib/env";

// GET /api/health          -> env and Supabase checks
// GET /api/health?ping=1   -> also sends one tiny request to the model
export async function GET(request: Request) {
  const env = Object.fromEntries(
    ["ANTHROPIC_API_KEY", "MODEL_ID", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"].map((k) => [k, Boolean(process.env[k])]),
  );

  let supabase: { ok: boolean; detail: string };
  if (!env.SUPABASE_SECRET_KEY) {
    supabase = { ok: false, detail: "SUPABASE_SECRET_KEY is not set" };
  } else {
    const { error } = await db().from("projects").select("id", { head: true, count: "exact" });
    supabase = error ? { ok: false, detail: error.message } : { ok: true, detail: "projects table reachable" };
  }

  let model: { ok: boolean; detail: string } | undefined;
  if (new URL(request.url).searchParams.get("ping") === "1") {
    try {
      const res = await claude().messages.create({
        model: MODEL_ID(),
        max_tokens: 16,
        messages: [{ role: "user", content: "Reply with OK" }],
      });
      model = { ok: true, detail: res.model };
    } catch (e) {
      model = { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }

  return Response.json({ env, supabase, model });
}
