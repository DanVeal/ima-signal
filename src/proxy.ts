import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renamed the `middleware` file convention to `proxy` — see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match every path except static assets, so the session cookie stays
     * fresh on every navigation. Excludes Next's internals and common
     * static file extensions.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
