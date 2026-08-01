"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/database.types";

type UserRole = Database["public"]["Enums"]["user_role"];

/** Every admin action re-checks this itself — never trust that the page that rendered the button already did. */
async function assertIsAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("id, role, auth_user_id")
    .eq("auth_user_id", user.id)
    .single();
  if (error || !profile || profile.role !== "ima_admin") {
    throw new Error("Only an IMA Admin can do this.");
  }
  return profile;
}

function computeInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function generateTempPassword(): string {
  // Readable-ish but random enough for a one-time, immediately-changeable credential.
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
}

export interface CreateUserState {
  error?: string;
  createdEmail?: string;
  tempPassword?: string;
}

export async function createUser(_prevState: CreateUserState, formData: FormData): Promise<CreateUserState> {
  await assertIsAdmin();

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const organisationId = String(formData.get("organisationId") ?? "");
  const role = String(formData.get("role") ?? "") as UserRole;

  if (!fullName || !email || !organisationId || !role) {
    return { error: "Fill in every field." };
  }

  const service = createServiceClient();
  const tempPassword = generateTempPassword();

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });
  if (createError) {
    return { error: createError.message.includes("already been registered") ? "That email already has an account." : createError.message };
  }

  const { error: profileError } = await service.from("user_profiles").insert({
    auth_user_id: created.user.id,
    full_name: fullName,
    email,
    avatar_initials: computeInitials(fullName),
    organisation_id: organisationId,
    role,
  });
  if (profileError) {
    // Roll back the auth user so we don't leave an orphaned account with no profile.
    await service.auth.admin.deleteUser(created.user.id);
    return { error: "Couldn't create the profile — nothing was created." };
  }

  revalidatePath("/admin");
  return { createdEmail: email, tempPassword };
}

export interface AdminActionState {
  error?: string;
  tempPassword?: string;
}

export async function setUserActive(userProfileId: string, isActive: boolean): Promise<AdminActionState> {
  const admin = await assertIsAdmin();
  if (admin.id === userProfileId && !isActive) {
    return { error: "You can't disable your own account." };
  }

  const service = createServiceClient();
  const { data: profile, error: profileError } = await service
    .from("user_profiles")
    .select("auth_user_id")
    .eq("id", userProfileId)
    .single();
  if (profileError || !profile) return { error: "User not found." };

  const { error: banError } = await service.auth.admin.updateUserById(profile.auth_user_id, {
    ban_duration: isActive ? "none" : "876600h",
  });
  if (banError) return { error: banError.message };

  const { error: updateError } = await service.from("user_profiles").update({ is_active: isActive }).eq("id", userProfileId);
  if (updateError) return { error: updateError.message };

  revalidatePath("/admin");
  return {};
}

export async function resetUserPassword(userProfileId: string): Promise<AdminActionState> {
  await assertIsAdmin();

  const service = createServiceClient();
  const { data: profile, error: profileError } = await service
    .from("user_profiles")
    .select("auth_user_id")
    .eq("id", userProfileId)
    .single();
  if (profileError || !profile) return { error: "User not found." };

  const tempPassword = generateTempPassword();
  const { error } = await service.auth.admin.updateUserById(profile.auth_user_id, { password: tempPassword });
  if (error) return { error: error.message };

  return { tempPassword };
}

export async function updateUserRoleAndOrg(
  userProfileId: string,
  role: UserRole,
  organisationId: string,
): Promise<AdminActionState> {
  await assertIsAdmin();

  const service = createServiceClient();
  const { error } = await service
    .from("user_profiles")
    .update({ role, organisation_id: organisationId })
    .eq("id", userProfileId);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return {};
}
