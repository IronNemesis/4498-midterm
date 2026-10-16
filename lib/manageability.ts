import type { CheckResult, Dependency, ManageabilityReport, Member, Step } from "./types";

export const MAX_STEP_HOURS = 2;
export const MIN_BUFFER_DAYS = 2;

interface Input {
  steps: Step[];
  members: Member[];
  dependencies: Dependency[];
  projectDueDate: string; // YYYY-MM-DD
}

const DAY_MS = 86_400_000;

function toUtc(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function weekStart(date: string): string {
  const t = toUtc(date);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
  return new Date(t - dow * DAY_MS).toISOString().slice(0, 10);
}

export function checkManageability({ steps, members, dependencies, projectDueDate }: Input): ManageabilityReport {
  const active = steps.filter((s) => !s.deferred && s.status !== "done");
  const byId = new Map(steps.map((s) => [s.id, s]));
  const memberName = new Map(members.map((m) => [m.id, m.name]));

  const size: CheckResult = { id: "step-size", name: `Every step is ${MAX_STEP_HOURS}h or less`, passed: true, details: [] };
  for (const s of active) {
    if (s.hours > MAX_STEP_HOURS) size.details.push(`"${s.title}" is ${s.hours}h`);
  }
  size.passed = size.details.length === 0;

  const owned: CheckResult = { id: "owned-dated", name: "Every step has an owner and a due date", passed: true, details: [] };
  for (const s of active) {
    if (!s.owner_id) owned.details.push(`"${s.title}" has no owner`);
    if (!s.due_date) owned.details.push(`"${s.title}" has no due date`);
  }
  owned.passed = owned.details.length === 0;

  const capacity: CheckResult = { id: "weekly-capacity", name: "No one exceeds weekly availability", passed: true, details: [] };
  const load = new Map<string, number>();
  for (const s of active) {
    if (!s.owner_id || !s.due_date) continue;
    const key = `${s.owner_id}|${weekStart(s.due_date)}`;
    load.set(key, (load.get(key) ?? 0) + s.hours);
  }
  for (const [key, hours] of load) {
    const [ownerId, week] = key.split("|");
    const member = members.find((m) => m.id === ownerId);
    if (member && hours > member.weekly_hours) {
      capacity.details.push(`${memberName.get(ownerId)}: ${hours}h planned vs ${member.weekly_hours}h available, week of ${week}`);
    }
  }
  capacity.passed = capacity.details.length === 0;

  const deps: CheckResult = { id: "dependencies", name: "Dependencies finish before the steps that need them", passed: true, details: [] };
  for (const d of dependencies) {
    const step = byId.get(d.step_id);
    const prereq = byId.get(d.depends_on_step_id);
    if (!step || !prereq || step.deferred || prereq.deferred) continue;
    if (step.due_date && prereq.due_date && toUtc(prereq.due_date) > toUtc(step.due_date)) {
      deps.details.push(`"${prereq.title}" (${prereq.due_date}) is due after "${step.title}" (${step.due_date})`);
    }
  }
  deps.passed = deps.details.length === 0;

  const buffer: CheckResult = { id: "buffer", name: `Final step is ${MIN_BUFFER_DAYS}+ days before the deadline`, passed: true, details: [] };
  const dates = active.map((s) => s.due_date).filter((d): d is string => Boolean(d));
  if (dates.length > 0) {
    const latest = dates.reduce((a, b) => (toUtc(a) > toUtc(b) ? a : b));
    const gapDays = Math.round((toUtc(projectDueDate) - toUtc(latest)) / DAY_MS);
    if (gapDays < MIN_BUFFER_DAYS) buffer.details.push(`Last step is due ${latest}, ${gapDays} day(s) before ${projectDueDate}`);
  }
  buffer.passed = buffer.details.length === 0;

  const checks = [size, owned, capacity, deps, buffer];
  return { passed: checks.every((c) => c.passed), checks };
}
