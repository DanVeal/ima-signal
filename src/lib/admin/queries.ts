import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/service";

type Client = SupabaseClient<Database>;

export interface AdminUserRow {
  id: string;
  authUserId: string;
  fullName: string;
  email: string;
  avatarInitials: string;
  organisationId: string;
  organisationName: string;
  organisationType: Database["public"]["Enums"]["organisation_type"];
  role: Database["public"]["Enums"]["user_role"];
  isActive: boolean;
  createdAt: string;
  lastSignInAt: string | null;
}

/**
 * Every user_profiles row joined with its organisation, plus auth.users'
 * last_sign_in_at (the closest thing to "session activity" the Supabase
 * Admin API exposes without a dedicated session-listing endpoint — see
 * docs/release-candidate-1.md for why "view active sessions" stops here).
 */
export async function getAdminUserList(supabase: Client): Promise<AdminUserRow[]> {
  const { data: profiles, error } = await supabase
    .from("user_profiles")
    .select("*, organisation:organisations(*)")
    .order("full_name");
  if (error) throw error;

  const serviceClient = createServiceClient();
  const authUserIds = new Set(profiles.map((p) => p.auth_user_id));
  const lastSignInByAuthId = new Map<string, string | null>();

  let page = 1;
  for (;;) {
    const { data, error: listError } = await serviceClient.auth.admin.listUsers({ page, perPage: 200 });
    if (listError) throw listError;
    for (const u of data.users) {
      if (authUserIds.has(u.id)) lastSignInByAuthId.set(u.id, u.last_sign_in_at ?? null);
    }
    if (data.users.length < 200) break;
    page += 1;
  }

  return profiles.map((p) => ({
    id: p.id,
    authUserId: p.auth_user_id,
    fullName: p.full_name,
    email: p.email,
    avatarInitials: p.avatar_initials,
    organisationId: p.organisation_id,
    organisationName: p.organisation.name,
    organisationType: p.organisation.type,
    role: p.role,
    isActive: p.is_active,
    createdAt: p.created_at,
    lastSignInAt: lastSignInByAuthId.get(p.auth_user_id) ?? null,
  }));
}
