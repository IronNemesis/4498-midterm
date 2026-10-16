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

export async function currentUser(): Promise<{ id: string; email: string } | null> {
  const supabase = await authClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user?.email) return null;
  return { id: data.user.id, email: data.user.email.toLowerCase() };
}

export type CurrentMember = { email: string; member: Member & { project_id: string; email: string | null } };

// The signed-in person's team membership (latest project), matched by email. Null if they are on no project yet.
export async function currentMember(): Promise<CurrentMember | null> {
  const user = await currentUser();
  if (!user) return null;
  const { data: member } = await db()
    .from("members")
    .select("*")
    .ilike("email", user.email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return member ? { email: user.email, member } : null;
}

export function unauthorized() {
  return Response.json({ error: "Sign in required" }, { status: 401 });
}
