"use server";

/**
 * Thin "use server" wrapper around queries.ts — runs as the signed-in
 * user's own request-scoped Supabase client, never the service role, so RLS
 * is the real gate. Mirrors review/actions.ts and intelligence/actions.ts.
 */
import { createClient } from "@/lib/supabase/server";
import { globalSearch, type SearchResult } from "./queries";

export async function searchAction(query: string): Promise<SearchResult[]> {
  const supabase = await createClient();
  return globalSearch(supabase, query);
}
