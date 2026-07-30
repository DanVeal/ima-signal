/**
 * Thin TypeScript wrappers over the three atomic wording RPC functions
 * defined in supabase/migrations/20260731090400_prams_wording_functions.sql.
 * The functions themselves do the real work (new group, repoint
 * membership, log activity) in one Postgres transaction; these wrappers
 * exist so callers get typed inputs/outputs instead of raw `.rpc()` calls.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export async function editSharedWording(supabase: Client, wordingGroupId: string, newText: string) {
  const { data, error } = await supabase.rpc("edit_shared_wording", {
    p_wording_group_id: wordingGroupId,
    p_new_text: newText,
  });
  if (error) throw error;
  return data as string;
}

export async function createVariantOverride(
  supabase: Client,
  wordingGroupId: string,
  matrixCellId: string,
  newText: string,
) {
  const { data, error } = await supabase.rpc("create_variant_override", {
    p_wording_group_id: wordingGroupId,
    p_matrix_cell_id: matrixCellId,
    p_new_text: newText,
  });
  if (error) throw error;
  return data as string;
}

/** Requires explicit confirmation at the call site — this performs the merge unconditionally once called. */
export async function remergeWordingCells(supabase: Client, matrixCellIds: string[], text: string) {
  const { data, error } = await supabase.rpc("remerge_wording_cells", {
    p_matrix_cell_ids: matrixCellIds,
    p_text: text,
  });
  if (error) throw error;
  return data as string;
}
