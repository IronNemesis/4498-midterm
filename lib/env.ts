export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. Check .env.`);
  return value;
}

export const MODEL_ID = () => process.env.MODEL_ID ?? "claude-sonnet-5-5";
