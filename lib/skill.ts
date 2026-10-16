import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Loads skills/<name>/SKILL.md and strips the front matter, for use as a task's system prompt.
export async function loadSkill(name: string): Promise<string> {
  const file = path.join(process.cwd(), "skills", name, "SKILL.md");
  const raw = await readFile(file, "utf8");
  return raw.replace(/^---[\s\S]*?---\s*/, "").trim();
}
