import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { db } from "./supabase";
import { loadSkill } from "./skill";
import { filesToBlocks } from "./extract";
import { callStructured, PlanOutput, ProjectFacts } from "./agent";
import { checkManageability, MAX_STEP_HOURS, MIN_BUFFER_DAYS } from "./manageability";
import type { Dependency, ManageabilityReport, Member, Step } from "./types";

export interface TeamInput {
  name: string;
  email: string;
  skills_text: string;
  prefs_text: string;
  weekly_hours: number;
}

export type Emit = (event: Record<string, unknown>) => void;

interface Input {
  userId: string;
  userEmail: string;
  files: File[];
  team: TeamInput[];
  overrides: { name?: string; due_date?: string };
  emit: Emit;
}

const today = () => new Date().toISOString().slice(0, 10);

export function planToSteps(plan: PlanOutput, members: Member[]): { steps: Step[]; dependencies: Dependency[] } {
  const byName = new Map(members.map((m) => [m.name.toLowerCase(), m]));
  const refs = new Set(plan.steps.map((s) => s.ref));
  return {
    steps: plan.steps.map((s) => ({
      id: s.ref,
      title: s.title,
      done_when: s.done_when,
      hours: s.hours,
      owner_id: byName.get(s.owner.trim().toLowerCase())?.id ?? null,
      due_date: s.due_date,
      status: "todo" as const,
      deferred: false,
      criterion_id: null,
      why_owner: s.why_owner,
    })),
    dependencies: plan.steps.flatMap((s) => s.depends_on.filter((d) => refs.has(d)).map((d) => ({ step_id: s.ref, depends_on_step_id: d }))),
  };
}

export function planningRules(facts: ProjectFacts, members: Member[]): string {
  return [
    `Today is ${today()}. The whole project is due ${facts.due_date}.`,
    `Hard rules (code will verify every one):`,
    `1. Every step is ${MAX_STEP_HOURS} hours or less.`,
    `2. Every step has an owner and a due date (YYYY-MM-DD).`,
    `3. For each person, the hours of steps due in any one Monday-to-Sunday week must not exceed their weekly hours: ${members.map((m) => `${m.name} ${m.weekly_hours}h/week`).join("; ")}. If the work does not fit, add a flag instead of overloading anyone.`,
    `4. A step's dependencies must be due on or before the step's own due date.`,
    `5. The last step is due at least ${MIN_BUFFER_DAYS} days before ${facts.due_date}.`,
    `6. Steps due on or before a milestone must still respect that milestone: ${facts.milestones.length ? facts.milestones.map((m) => `${m.title} (${m.date})`).join("; ") : "none listed"}.`,
    `7. The owner field must be exactly one of: ${members.map((m) => m.name).join(", ")}.`,
    `Cover every criterion. Use each criterion's title exactly in the criterion field.`,
    `Size the plan to the team's real capacity: total planned hours should be about 60-75% of (all members' weekly hours x weeks until the last step), leaving slack. Prefer steps of 1.5-2 hours, so a typical plan is 25-50 steps. Do not split work into tiny steps.`,
    `Keep text short: titles under 10 words, done_when and why_owner one short sentence each.`,
  ].join("\n");
}

export async function runCreateProject({ userId, userEmail, files, team, overrides, emit }: Input) {
  const stage = (id: string, status: "running" | "done" | "error", label: string, detail?: string) =>
    emit({ type: "stage", id, status, label, detail });
  const runs: { stage: string; model: string; input: unknown; output: unknown; ms: number; usage: unknown }[] = [];

  if (!team.some((t) => t.email.toLowerCase() === userEmail)) {
    throw new Error("Add yourself to the team, using the email you signed in with. Otherwise you couldn't see the project.");
  }
  if (new Set(team.map((t) => t.name.trim().toLowerCase())).size !== team.length) throw new Error("Each teammate needs a different name.");

  stage("read", "running", "Reading your documents");
  const blocks = await filesToBlocks(files);
  stage("read", "done", "Read your documents", files.map((f) => f.name).join(", "));

  stage("understand", "running", "Understanding the project: criteria, due dates, requirements");
  const extraction = await callStructured({
    system:
      `You read project documents such as assignment descriptions, rubrics, and syllabi, and extract the facts needed to plan the work. ` +
      `Today is ${today()}. Use only what the documents say; do not invent criteria, points, or dates. If a date has no year, use the next upcoming occurrence.`,
    content: [...blocks, { type: "text", text: "Extract the project facts." }],
    schema: ProjectFacts,
    maxTokens: 6000,
    effort: "low",
  });
  const facts: ProjectFacts = {
    ...extraction.data,
    name: overrides.name || extraction.data.name,
    due_date: overrides.due_date || extraction.data.due_date,
  };
  runs.push({ stage: "extract", model: extraction.model, input: { files: files.map((f) => f.name) }, output: facts, ms: extraction.ms, usage: extraction.usage });
  stage(
    "understand",
    "done",
    "Understood the project",
    `${facts.name}: due ${facts.due_date}, ${facts.criteria.length} criteria, ${facts.milestones.length} milestones`,
  );

  stage("save", "running", "Setting up the project and team");
  const rubricText = [
    facts.summary,
    "",
    "Criteria:",
    ...facts.criteria.map((c) => `- ${c.title} (${c.points} pts): ${c.description}`),
    "",
    "Requirements:",
    ...facts.requirements.map((r) => `- ${r}`),
  ].join("\n");

  const { data: project, error: projectError } = await db()
    .from("projects")
    .insert({
      name: facts.name,
      rubric_text: rubricText,
      due_date: facts.due_date,
      created_by: userId,
      summary: facts.summary,
      milestones: facts.milestones,
      source_files: files.map((f) => f.name),
    })
    .select()
    .single();
  if (projectError) throw new Error(`Couldn't save the project: ${projectError.message}`);

  const { data: memberRows, error: memberError } = await db()
    .from("members")
    .insert(team.map((t) => ({ project_id: project.id, name: t.name.trim(), email: t.email.trim().toLowerCase(), skills_text: t.skills_text, prefs_text: t.prefs_text, weekly_hours: t.weekly_hours })))
    .select();
  if (memberError) throw new Error(`Couldn't save the team: ${memberError.message}`);
  const members = memberRows as Member[];

  const { error: criteriaError } = await db()
    .from("criteria")
    .insert(facts.criteria.map((c, i) => ({ project_id: project.id, title: c.title, points: c.points, position: i })));
  if (criteriaError) throw new Error(`Couldn't save the criteria: ${criteriaError.message}`);
  stage("save", "done", "Set up the project and team", `${members.length} team members added`);

  const skill = await loadSkill("rubric-to-step-plan");
  const system = `${skill}\n\n${planningRules(facts, members)}`;
  const teamText = members.map((m) => `- ${m.name}: ${m.weekly_hours}h/week. Skills: ${m.skills_text || "not given"}. Preferences: ${m.prefs_text || "not given"}.`).join("\n");
  const baseContent: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: `Project: ${facts.name}\nDue: ${facts.due_date}\n\nSummary: ${facts.summary}\n\nCriteria:\n${facts.criteria.map((c) => `- ${c.title} (${c.points} pts): ${c.description}`).join("\n")}\n\nRequirements:\n${facts.requirements.map((r) => `- ${r}`).join("\n")}\n\nTeam:\n${teamText}\n\nProduce the step plan.`,
    },
  ];

  const draft = async (feedback?: { previous: PlanOutput; report: ManageabilityReport }) => {
    const content = feedback
      ? [
          ...baseContent,
          {
            type: "text" as const,
            text: `Your previous plan failed these checks:\n${feedback.report.checks.filter((c) => !c.passed).map((c) => `- ${c.name}: ${c.details.slice(0, 12).join("; ")}`).join("\n")}\n\nPrevious plan:\n${JSON.stringify(feedback.previous)}\n\nReturn a corrected, complete plan that passes every check.`,
          },
        ]
      : baseContent;
    return callStructured({
      system,
      content,
      schema: PlanOutput,
      maxTokens: 32000,
      effort: "medium",
    });
  };

  stage("plan", "running", "Drafting the plan: small steps, owners, and dates");
  let result = await draft();
  runs.push({ stage: "plan", model: result.model, input: { rules: "see planningRules" }, output: result.data, ms: result.ms, usage: result.usage });
  stage("plan", "done", "Drafted the plan", `${result.data.steps.length} steps`);

  stage("check", "running", "Checking the plan: step size, owners, weekly capacity, order, buffer");
  let converted = planToSteps(result.data, members);
  let report = checkManageability({ ...converted, members, projectDueDate: facts.due_date });
  if (!report.passed) {
    stage("check", "running", "Some checks failed. Asking the agent to fix the plan once", report.checks.filter((c) => !c.passed).map((c) => c.name).join("; "));
    result = await draft({ previous: result.data, report });
    runs.push({ stage: "plan-retry", model: result.model, input: { failed: report.checks.filter((c) => !c.passed).map((c) => c.id) }, output: result.data, ms: result.ms, usage: result.usage });
    converted = planToSteps(result.data, members);
    report = checkManageability({ ...converted, members, projectDueDate: facts.due_date });
  }
  stage("check", report.passed ? "done" : "error", report.passed ? "Plan passed every check" : "Plan still fails some checks. You can review and decide", report.checks.filter((c) => !c.passed).map((c) => c.name).join("; "));

  stage("proposal", "running", "Saving the plan for your team to review");
  const { data: run, error: runError } = await db()
    .from("agent_runs")
    .insert({ project_id: project.id, task: "T2", model: runs[0].model, input: { stages: runs.map((r) => ({ stage: r.stage, ms: r.ms, usage: r.usage })) }, output: { steps: result.data.steps.length, flags: result.data.flags }, status: "done", duration_ms: runs.reduce((s, r) => s + r.ms, 0) })
    .select()
    .single();
  if (runError) throw new Error(`Couldn't log the agent run: ${runError.message}`);

  const memberId = new Map(members.map((m) => [m.name.toLowerCase(), m.id]));
  const { data: proposal, error: proposalError } = await db()
    .from("plan_proposals")
    .insert({
      project_id: project.id,
      kind: "kickoff",
      status: report.passed ? "pending" : "failed_checks",
      payload: { steps: result.data.steps.map((s) => ({ ...s, owner_id: memberId.get(s.owner.trim().toLowerCase()) ?? null })), flags: result.data.flags },
      justification: result.data.flags.join("\n") || null,
      check_results: report,
      agent_run_id: run.id,
    })
    .select()
    .single();
  if (proposalError) throw new Error(`Couldn't save the plan: ${proposalError.message}`);
  stage("proposal", "done", "Plan is ready for review");

  return { projectId: project.id as string, proposalId: proposal.id as string, passed: report.passed, stepCount: result.data.steps.length };
}
