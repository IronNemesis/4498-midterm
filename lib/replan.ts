import "server-only";
import { z } from "zod";
import { db } from "./supabase";
import type { Dependency, Step } from "./types";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const Change = z.object({
  action: z.enum(["split", "reassign", "move_date", "defer"]).describe(
    "split: replace the step with smaller new_steps; reassign: give it to new_owner_id; move_date: change its due date to new_due_date; defer: drop it from the active plan",
  ),
  step_id: z.string().describe("id of the existing step this change applies to"),
  new_owner_id: z.string().nullable().describe("For reassign: the member id of the new owner; otherwise null"),
  new_due_date: date.nullable().describe("For move_date: the new due date; otherwise null"),
  new_steps: z
    .array(z.object({ title: z.string(), done_when: z.string(), hours: z.number(), owner_id: z.string(), due_date: date }))
    .describe("For split: the replacement steps (each 2 hours or less); otherwise empty"),
  reason: z.string().describe("One sentence: why this change"),
});
export type Change = z.infer<typeof Change>;

export const Replan = z.object({
  diagnosis: z.string().describe("What actually caused the slip, based on the evidence you gathered"),
  changes: z.array(Change).describe("The smallest set of changes that makes the plan manageable again"),
  justification: z.string().describe("2-4 sentences the affected teammates will read, explaining the proposal"),
});
export type Replan = z.infer<typeof Replan>;

export interface StepRow extends Step {
  project_id: string;
}

// Applies a re-plan to an in-memory copy of the plan so T3 can check it before anyone sees it.
export function applyInMemory(steps: Step[], dependencies: Dependency[], changes: Change[]) {
  const next = steps.map((s) => ({ ...s }));
  let deps = [...dependencies];
  for (const c of changes) {
    const step = next.find((s) => s.id === c.step_id);
    if (!step) continue;
    if (c.action === "reassign" && c.new_owner_id) step.owner_id = c.new_owner_id;
    if (c.action === "move_date" && c.new_due_date) step.due_date = c.new_due_date;
    if (c.action === "defer") step.deferred = true;
    if (c.action === "split") {
      step.deferred = true;
      const prereqs = deps.filter((d) => d.step_id === step.id).map((d) => d.depends_on_step_id);
      const dependents = deps.filter((d) => d.depends_on_step_id === step.id).map((d) => d.step_id);
      c.new_steps.forEach((n, i) => {
        const id = `${step.id}-split-${i}`;
        next.push({ ...step, id, title: n.title, done_when: n.done_when, hours: n.hours, owner_id: n.owner_id, due_date: n.due_date, deferred: false, status: "todo" });
        deps = deps.concat(prereqs.map((p) => ({ step_id: id, depends_on_step_id: p })), dependents.map((d) => ({ step_id: d, depends_on_step_id: id })));
      });
    }
  }
  return { steps: next, dependencies: deps };
}

// Writes an accepted re-plan to the database (H2).
export async function applyToDb(projectId: string, changes: Change[]) {
  for (const c of changes) {
    const { data: step } = await db().from("steps").select("*").eq("id", c.step_id).eq("project_id", projectId).maybeSingle();
    if (!step) continue;
    const now = new Date().toISOString();
    if (c.action === "reassign" && c.new_owner_id) await db().from("steps").update({ owner_id: c.new_owner_id, updated_at: now }).eq("id", step.id);
    if (c.action === "move_date" && c.new_due_date) await db().from("steps").update({ due_date: c.new_due_date, updated_at: now }).eq("id", step.id);
    if (c.action === "defer") await db().from("steps").update({ deferred: true, updated_at: now }).eq("id", step.id);
    if (c.action === "split") {
      const [{ data: prereqs }, { data: dependents }] = await Promise.all([
        db().from("step_dependencies").select("depends_on_step_id").eq("step_id", step.id),
        db().from("step_dependencies").select("step_id").eq("depends_on_step_id", step.id),
      ]);
      const rows = c.new_steps.map((n) => ({
        id: crypto.randomUUID(),
        project_id: projectId,
        criterion_id: step.criterion_id,
        title: n.title,
        done_when: n.done_when,
        hours: n.hours,
        owner_id: n.owner_id,
        due_date: n.due_date,
        why_owner: c.reason,
      }));
      const { error } = await db().from("steps").insert(rows);
      if (error) throw new Error(error.message);
      const newDeps = rows.flatMap((r) => [
        ...(prereqs ?? []).map((p) => ({ step_id: r.id, depends_on_step_id: p.depends_on_step_id })),
        ...(dependents ?? []).map((d) => ({ step_id: d.step_id, depends_on_step_id: r.id })),
      ]);
      if (newDeps.length) await db().from("step_dependencies").insert(newDeps);
      await db().from("steps").update({ deferred: true, updated_at: now }).eq("id", step.id);
    }
  }
}
