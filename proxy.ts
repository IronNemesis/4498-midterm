import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie and sends signed-out visitors to /login.
// API routes are not redirected; they check the session themselves and return 401.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    // Let /api/health through so it can report exactly which variables are missing.
    if (request.nextUrl.pathname === "/api/health") return response;
    const missing = [!url && "SUPABASE_URL", !key && "SUPABASE_PUBLISHABLE_KEY"].filter(Boolean).join(", ");
    return new NextResponse(`Server misconfigured: missing environment variable(s) ${missing}. Add them in Vercel and redeploy.`, { status: 500 });
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;
  const isPublic = pathname.startsWith("/login") || pathname.startsWith("/api/");

  if (!data.user && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
