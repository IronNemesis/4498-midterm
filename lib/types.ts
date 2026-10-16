export type StepStatus = "todo" | "in_progress" | "done" | "blocked" | "behind";

export interface Member {
  id: string;
  name: string;
  skills_text: string;
  prefs_text: string;
  weekly_hours: number;
}

export interface Step {
  id: string;
  title: string;
  done_when: string;
  hours: number;
  owner_id: string | null;
  due_date: string | null; // YYYY-MM-DD
  status: StepStatus;
  deferred: boolean;
  criterion_id: string | null;
  why_owner: string | null;
}

export interface Dependency {
  step_id: string;
  depends_on_step_id: string;
}

export interface CheckResult {
  id: string;
  name: string;
  passed: boolean;
  details: string[];
}

export interface ManageabilityReport {
  passed: boolean;
  checks: CheckResult[];
}
