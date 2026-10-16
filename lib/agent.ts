import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { claude } from "./anthropic";
import { MODEL_ID } from "./env";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const ProjectFacts = z.object({
  name: z.string().describe("Short project name"),
  due_date: date.describe("Final due date of the whole project"),
  summary: z.string().describe("2-4 sentence summary of what the project is and what is being asked"),
  criteria: z
    .array(z.object({ title: z.string(), points: z.number(), description: z.string() }))
    .describe("Every graded criterion or deliverable with its points. Use points 0 if none are stated."),
  milestones: z.array(z.object({ title: z.string(), date })).describe("Dated intermediate milestones, checkpoints, or reviews"),
  requirements: z.array(z.string()).describe("Hard requirements and constraints (minimum counts, formats, word limits, rules)"),
});
export type ProjectFacts = z.infer<typeof ProjectFacts>;

export const PlanOutput = z.object({
  steps: z.array(
    z.object({
      ref: z.string().describe("Short unique id for this step, e.g. s1, s2"),
      criterion: z.string().describe("Title of the criterion this step serves, exactly as listed"),
      title: z.string(),
      done_when: z.string().describe("A concrete, checkable done condition"),
      hours: z.number().describe("Estimated hours, at most 2"),
      owner: z.string().describe("Exact name of one team member"),
      due_date: date,
      depends_on: z.array(z.string()).describe("refs of steps that must finish first"),
      why_owner: z.string().describe("One sentence on why this person"),
    }),
  ),
  flags: z.array(z.string()).describe("Anything that could not be covered, and why"),
});
export type PlanOutput = z.infer<typeof PlanOutput>;

interface StructuredCall<T> {
  system: string;
  content: Anthropic.ContentBlockParam[];
  schema: z.ZodType<T>;
  maxTokens: number;
  effort?: "low" | "medium" | "high";
}

// One model call that must return JSON matching the schema (structured outputs), validated again with zod.
export async function callStructured<T>(call: StructuredCall<T>) {
  const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(call.schema) as Record<string, unknown>;
  const started = Date.now();
  const res = await claude()
    .messages.stream({
      model: MODEL_ID(),
      max_tokens: call.maxTokens,
      system: call.system,
      messages: [{ role: "user", content: call.content }],
      output_config: { format: { type: "json_schema", schema: jsonSchema }, ...(call.effort ? { effort: call.effort } : {}) },
    })
    .finalMessage();

  if (res.stop_reason === "max_tokens") throw new Error("The model's answer was cut off because it was too long. Try fewer or smaller documents.");
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("The model didn't return an answer. Try again.");
  let json: unknown;
  try {
    json = JSON.parse(block.text);
  } catch {
    throw new Error("The model's answer wasn't valid JSON. Try again.");
  }
  const parsed = call.schema.safeParse(json);
  if (!parsed.success) throw new Error(`The model's output didn't match the expected format: ${z.prettifyError(parsed.error)}`);
  return {
    data: parsed.data,
    model: res.model,
    usage: { input: res.usage.input_tokens, output: res.usage.output_tokens },
    ms: Date.now() - started,
  };
}
