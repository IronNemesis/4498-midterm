import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { requireEnv } from "./env";

let client: Anthropic | null = null;

export function claude(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  return client;
}
