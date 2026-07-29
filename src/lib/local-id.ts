/**
 * Client-side id generator for content created in the browser before it
 * has a real database row (Phase 1 demo interactions only — Supabase will
 * assign real ids from Phase 2 onward). Kept in a plain, non-component
 * module so it isn't subject to the React "components must be pure" rule.
 */
export function createLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
