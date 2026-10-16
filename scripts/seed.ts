// Seeds the demo project and links each team member to their Supabase Auth user.
// Usage: npm run seed
// Prerequisites: both people already exist under Authentication > Users in the Supabase dashboard,
// scripts/team.local.json exists (copy scripts/team.example.json), and docs/rubric.txt exists.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env");

const supabase = createClient(url, secret, { auth: { persistSession: false } });
const config = JSON.parse(readFileSync("scripts/team.local.json", "utf8"));
const rubric = readFileSync("docs/rubric.txt", "utf8");

const { data: list, error: listError } = await supabase.auth.admin.listUsers({ perPage: 200 });
if (listError) throw listError;

const members = config.team.map((person: { email: string; name: string; skills_text: string; prefs_text: string; weekly_hours: number }) => {
  const user = list.users.find((u) => u.email?.toLowerCase() === person.email.toLowerCase());
  if (!user) throw new Error(`No Supabase Auth user for ${person.email}. Add them under Authentication > Users first.`);
  return { id: user.id, name: person.name, skills_text: person.skills_text, prefs_text: person.prefs_text, weekly_hours: person.weekly_hours };
});

await supabase.from("projects").delete().eq("name", config.project.name);
const { data: project, error: projectError } = await supabase
  .from("projects")
  .insert({ name: config.project.name, rubric_text: rubric, due_date: config.project.due_date })
  .select()
  .single();
if (projectError) throw projectError;

const { error: memberError } = await supabase.from("members").insert(members.map((m: object) => ({ ...m, project_id: project.id })));
if (memberError) throw memberError;

console.log(`Seeded "${project.name}" (due ${project.due_date}) with ${members.length} members.`);
