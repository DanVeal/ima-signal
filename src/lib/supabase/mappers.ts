/**
 * Row → frontend-domain-shape mappers. Existing components render against
 * the camelCase types in src/types/domain.ts; these mappers let a real
 * Supabase row (snake_case, per the generated types) stand in for a mock
 * row with zero changes to the rendering components themselves.
 */
import type { Organisation, UserProfile } from "@/types/domain";
import type { Tables } from "./database.types";

export function toOrganisationDomain(row: Tables<"organisations">): Organisation {
  return { id: row.id, type: row.type, name: row.name };
}

export function toUserProfileDomain(row: Tables<"user_profiles">): UserProfile {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    avatarInitials: row.avatar_initials,
    organisationId: row.organisation_id,
    role: row.role,
  };
}
