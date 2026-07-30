"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/** Browser-side Supabase client — respects RLS as the signed-in user (never the service role). */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
