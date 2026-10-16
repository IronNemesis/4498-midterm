import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireEnv } from "./env";
import { db } from "./supabase";
import type { Member } from "./types";

// Supabase Auth client bound to the request's cookies, using the publishable key.
export async function authClient() {
  const store = await cookies();
  return createServerClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_PUBLISHABLE_KEY"), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component; the proxy refreshes the session cookies instead.
        }
      },
    },
  });
}

// The signed-in team member, or null. A member's id equals their Supabase Auth user id (see scripts/seed.ts).
export async function currentMember(): Promise<{ email: string; member: Member & { project_id: string } } | null> {
  const supabase = await authClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: member } = await db().from("members").select("*").eq("id", data.user.id).maybeSingle();
  if (!member) return null;
  return { email: data.user.email ?? "", member };
}

export function unauthorized() {
  return Response.json({ error: "Sign in required" }, { status: 401 });
}
