import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { claude } from "./anthropic";
import { MODEL_ID } from "./env";
import { db } from "./supabase";
import { checkManageability, MAX_STEP_HOURS, MIN_BUFFER_DAYS } from "./manageability";
import { applyInMemory, Replan } from "./replan";
import type { Dependency, ManageabilityReport, Member, Step } from "./types";
import type { Emit } from "./pipeline";

// T4 containment: read-only tools, a hard cap on tool calls and on wall-clock time.
export const MAX_TOOL_CALLS = 5;
export const TIME_LIMIT_MS = 60_000;

const idInput = (name: string, description: string) => ({
  type: "object" as const,
  properties: {
    [name]: { type: "string", description },
    why: { type: "string", description: "One short sentence for teammates: what this call should tell you, given what you know so far" },
  },
  required: [name, "why"],
});

const TOOLS: Anthropic.Tool[] = [
  { name: "get_task", description: "Read one step: estimate, hours logged so far, owner, due date, status, and criterion.", input_schema: idInput("step_id", "Step id") },
  { name: "get_checkin_history", description: "Read a member's recent check-ins across all their steps: status, note, hours logged vs. estimate. Use it to tell a one-off from a pattern.", input_schema: idInput("member_id", "Member id") },
  { name: "get_member_load", description: "Read a member's weekly availability and open steps, with planned hours per week. Use it to find who has slack.", input_schema: idInput("member_id", "Member id") },
  { name: "get_dependencies", description: "Read what a step is waiting on and which steps are waiting on it, with their status and due dates.", input_schema: idInput("step_id", "Step id") },
];

const { $schema: _ignored, ...replanSchema } = z.toJSONSchema(Replan) as Record<string, unknown>;
TOOLS.push({
  name: "propose_replan",
  description: "Finish the investigation by proposing the re-plan. Call this exactly once, when you have enough evidence.",
  input_schema: replanSchema as Anthropic.Tool["input_schema"],
});

const weekStart = (d: string) => {
  const t = Date.parse(`${d}T00:00:00Z`);
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - dow * 86_400_000).toISOString().slice(0, 10);
};

async function runTool(projectId: string, name: string, input: Record<string, string>) {
  if (name === "get_task") {
    const { data: step } = await db().from("steps").select("*, members(name), criteria(title)").eq("id", input.step_id).eq("project_id", projectId).maybeSingle();
    if (!step) return { error: "No such step" };
    const { data: checkins } = await db().from("checkins").select("status, note, hours_logged, created_at").eq("step_id", step.id).order("created_at");
    const logged = (checkins ?? []).reduce((s, c) => s + Number(c.hours_logged), 0);
    return { id: step.id, title: step.title, done_when: step.done_when, estimate_hours: step.hours, hours_logged: logged, owner_id: step.owner_id, owner: step.members?.name, due_date: step.due_date, status: step.status, criterion: step.criteria?.title, checkins };
  }
  if (name === "get_checkin_history") {
    const { data } = await db().from("checkins").select("status, note, hours_logged, created_at, steps(title, hours)").eq("member_id", input.member_id).order("created_at", { ascending: false }).limit(20);
    return { checkins: (data ?? []).map((c) => ({ step: (c.steps as { title?: string } | null)?.title, estimate_hours: (c.steps as { hours?: number } | null)?.hours, status: c.status, hours_logged: c.hours_logged, note: c.note, at: c.created_at })) };
  }
  if (name === "get_member_load") {
    const { data: member } = await db().from("members").select("id, name, weekly_hours, skills_text, prefs_text").eq("id", input.member_id).eq("project_id", projectId).maybeSingle();
    if (!member) return { error: "No such member" };
    const { data: steps } = await db().from("steps").select("id, title, hours, due_date, status").eq("owner_id", member.id).eq("deferred", false).neq("status", "done").order("due_date");
    const perWeek: Record<string, number> = {};
    for (const s of steps ?? []) if (s.due_date) perWeek[weekStart(s.due_date)] = (perWeek[weekStart(s.due_date)] ?? 0) + Number(s.hours);
    return { ...member, planned_hours_by_week: perWeek, open_steps: steps };
  }
  if (name === "get_dependencies") {
    const [{ data: before }, { data: after }] = await Promise.all([
      db().from("step_dependencies").select("steps!step_dependencies_depends_on_step_id_fkey(id, title, status, due_date, owner_id)").eq("step_id", input.step_id),
      db().from("step_dependencies").select("steps!step_dependencies_step_id_fkey(id, title, status, due_date, owner_id)").eq("depends_on_step_id", input.step_id),
    ]);
    return { waits_on: (before ?? []).map((r) => r.steps), needed_by: (after ?? []).map((r) => r.steps) };
  }
  return { error: `Unknown tool ${name}` };
}

interface Input {
  projectId: string;
  checkinId: string;
  stepId: string;
  emit: Emit;
}

export async function investigateSlip({ projectId, checkinId, stepId, emit }: Input) {
  const [{ data: project }, { data: members }, { data: checkin }, { data: slipped }] = await Promise.all([
    db().from("projects").select("*").eq("id", projectId).single(),
    db().from("members").select("*").eq("project_id", projectId),
    db().from("checkins").select("*").eq("id", checkinId).single(),
    db().from("steps").select("*").eq("id", stepId).single(),
  ]);
  const team = (members ?? []) as Member[];
  const reporter = team.find((m) => m.id === checkin.member_id);

  const { data: run } = await db()
    .from("agent_runs")
    .insert({ project_id: projectId, task: "T4", model: MODEL_ID(), input: { checkin_id: checkinId, step_id: stepId }, status: "running" })
    .select()
    .single();

  const system = [
    "You are the re-planning agent for a student group project. A teammate reported a step as blocked or behind.",
    "Investigate why, using the read-only tools, then propose the smallest re-plan that makes the project manageable again.",
    "Decide what to look at next based on what each result tells you. Do not run every tool by habit.",
    `You may call at most ${MAX_TOOL_CALLS} investigation tools, then you must call propose_replan.`,
    "Possible fixes: split a step that is too big, reassign it to someone with slack, move a date if nothing downstream breaks, or defer low-value work.",
    `The proposal must keep every step at ${MAX_STEP_HOURS} hours or less, keep each person within their weekly hours, keep dependencies in order, and finish at least ${MIN_BUFFER_DAYS} days before ${project.due_date}.`,
    "You cannot change the plan yourself. The affected teammates will accept or decline your proposal, so be specific and fair, and never blame anyone.",
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
  ].join("\n");

  const context = [
    `Project: ${project.name}, due ${project.due_date}.`,
    `Team (id: name, weekly hours): ${team.map((m) => `${m.id}: ${m.name}, ${m.weekly_hours}h/week`).join("; ")}.`,
    `${reporter?.name ?? "A teammate"} marked step ${slipped.id} ("${slipped.title}", ${slipped.hours}h, due ${slipped.due_date}) as ${checkin.status}.`,
    `Their note: "${checkin.note || "(no note)"}". Hours logged on this check-in: ${checkin.hours_logged}.`,
  ].join("\n");

  const { data: steps } = await db().from("steps").select("*").eq("project_id", projectId);
  const { data: deps } = await db()
    .from("step_dependencies")
    .select("step_id, depends_on_step_id")
    .in("step_id", (steps ?? []).map((s) => s.id));
  const check = (r: Replan) => checkManageability({ ...applyInMemory((steps ?? []) as Step[], (deps ?? []) as Dependency[], r.changes), members: team, projectDueDate: project.due_date });

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: context }];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIME_LIMIT_MS);
  let calls = 0;
  let seq = 0;
  let nudged = false;
  let replan: Replan | null = null;
  let finalReport: ManageabilityReport | null = null;
  let revised = false;

  try {
    while (!replan) {
      const res = await claude().messages.create({ model: MODEL_ID(), max_tokens: 6000, system, tools: TOOLS, messages }, { signal: controller.signal });
      messages.push({ role: "assistant", content: res.content });
      const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ").trim();
      const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

      if (uses.length === 0) {
        if (nudged) throw new Error(`The agent stopped without proposing a re-plan (${res.stop_reason} ${JSON.stringify((res as unknown as { stop_details?: unknown }).stop_details ?? null)}): ${text.slice(0, 400)}`);
        nudged = true;
        messages.push({ role: "user", content: "Call propose_replan now with your proposal." });
        continue;
      }

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of uses) {
        if (use.name === "propose_replan") {
          const parsed = Replan.safeParse(use.input);
          if (!parsed.success) {
            results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: z.prettifyError(parsed.error) });
            continue;
          }
          emit({ type: "stage", id: "check", status: "running", label: "Checking the proposal against the manageability rules" });
          const report = check(parsed.data);
          if (!report.passed && !revised) {
            revised = true;
            const failed = report.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.details.slice(0, 6).join("; ")}`).join("\n");
            emit({ type: "stage", id: "check", status: "running", label: "Proposal failed a check. The agent is revising it once", detail: report.checks.filter((c) => !c.passed).map((c) => c.name).join("; ") });
            results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: `The proposal fails these checks:\n${failed}\nCall propose_replan again with a corrected proposal.` });
            continue;
          }
          replan = parsed.data;
          finalReport = report;
          results.push({ type: "tool_result", tool_use_id: use.id, content: "Received." });
          continue;
        }
        if (calls >= MAX_TOOL_CALLS) {
          results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: "Tool budget used up. Call propose_replan now." });
          continue;
        }
        calls += 1;
        seq += 1;
        const { why: rationale = "", ...input } = use.input as Record<string, string>;
        emit({ type: "tool", seq, tool: use.name, input, rationale, status: "running" });
        const output = await runTool(projectId, use.name, input);
        await db().from("agent_tool_calls").insert({ run_id: run.id, seq, tool_name: use.name, tool_input: input, tool_output: output, rationale: rationale || null });
        emit({ type: "tool", seq, tool: use.name, input, rationale, status: "done", summary: summarize(use.name, output) });
        results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(output) });
      }
      if (!replan) messages.push({ role: "user", content: results });
    }
  } catch (e) {
    const capped = controller.signal.aborted;
    await db().from("agent_runs").update({ status: capped ? "capped" : "failed", tool_calls: calls, output: { error: String(e) } }).eq("id", run.id);
    throw new Error(capped ? "The investigation hit its 60-second limit. The slip is handed to the team to sort out." : e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }

  const plan = replan as Replan | null;
  if (!plan) throw new Error("The agent stopped without proposing a re-plan.");

  const report = finalReport as ManageabilityReport;
  emit({ type: "stage", id: "check", status: report.passed ? "done" : "error", label: report.passed ? "Proposal passed every check" : "Proposal fails some checks. Handed to the team", detail: report.checks.filter((c) => !c.passed).map((c) => c.name).join("; ") });

  await db().from("agent_runs").update({ status: "done", tool_calls: calls, output: plan, duration_ms: null }).eq("id", run.id);
  const affected = [...new Set([slipped.owner_id, ...plan.changes.flatMap((c) => [c.new_owner_id, ...c.new_steps.map((n) => n.owner_id)])].filter(Boolean))];
  const { data: proposal, error } = await db()
    .from("plan_proposals")
    .insert({
      project_id: projectId,
      kind: "replan",
      status: report.passed ? "pending" : "failed_checks",
      payload: { diagnosis: plan.diagnosis, changes: plan.changes, affected_member_ids: affected },
      justification: plan.justification,
      check_results: report,
      agent_run_id: run.id,
      trigger_checkin: checkinId,
    })
    .select()
    .single();
  if (error) throw new Error(`Couldn't save the proposal: ${error.message}`);
  return { proposalId: proposal.id as string, passed: report.passed, toolCalls: calls };
}

function summarize(tool: string, output: Record<string, unknown>): string {
  if ("error" in output) return String(output.error);
  if (tool === "get_task") return `${output.title}: ${output.hours_logged}h logged of ${output.estimate_hours}h estimated, due ${output.due_date}`;
  if (tool === "get_checkin_history") {
    const list = output.checkins as { status: string }[];
    return `${list.length} recent check-ins, ${list.filter((c) => c.status === "behind" || c.status === "blocked").length} behind or blocked`;
  }
  if (tool === "get_member_load") {
    const open = (output.open_steps as unknown[] | null)?.length ?? 0;
    return `${output.name}: ${output.weekly_hours}h/week available, ${open} open steps`;
  }
  if (tool === "get_dependencies") {
    return `waits on ${(output.waits_on as unknown[]).length}, needed by ${(output.needed_by as unknown[]).length}`;
  }
  return "";
}
