import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Service-role Supabase client — bypasses RLS entirely. Server-only, never
 * imported from a Client Component. Reserved for admin/back-office
 * operations (seeding, ops tooling); application request paths must always
 * go through the session-scoped client in `server.ts` so RLS is enforced.
 */
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
