import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase Auth's email links (password reset, invite) redirect here with a
 * `?code=...` — this is the server-side leg that exchanges it for a real
 * session (via cookies) before sending the user on to `next`. Query params
 * (unlike a URL fragment) reach the server, which is why this has to be a
 * route handler rather than something the reset-password page does itself.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/"}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=reset-link-expired`);
}
