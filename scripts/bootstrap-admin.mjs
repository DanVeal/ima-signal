/**
 * One-time production bootstrap: creates the first IMA organisation and
 * the first ima_admin user, so someone can actually log into the real
 * Admin area and take it from there (every other user/org is created
 * through that UI — see src/lib/admin/actions.ts). Run this exactly once
 * against a freshly-migrated, unseeded hosted database.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   BOOTSTRAP_ADMIN_EMAIL=you@ima.global BOOTSTRAP_ADMIN_NAME="Your Name" \
 *   node --import tsx scripts/bootstrap-admin.mjs
 *
 * Prints a temporary password at the end — sign in and change it (or use
 * "Forgot password") immediately.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
const fullName = process.env.BOOTSTRAP_ADMIN_NAME;

if (!url || !serviceKey || !email || !fullName) {
  console.error(
    "Missing required env vars. Need: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME",
  );
  process.exit(1);
}

const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

function computeInitials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function generateTempPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
}

async function main() {
  const { data: existingOrgs, error: orgReadError } = await service
    .from("organisations")
    .select("id, name, type")
    .eq("type", "ima")
    .limit(1);
  if (orgReadError) throw orgReadError;

  let imaOrgId = existingOrgs?.[0]?.id;
  if (!imaOrgId) {
    const { data: org, error: orgError } = await service
      .from("organisations")
      .insert({ name: "IMA", type: "ima" })
      .select("id")
      .single();
    if (orgError) throw orgError;
    imaOrgId = org.id;
    console.log("Created IMA organisation:", imaOrgId);
  } else {
    console.log("Using existing IMA organisation:", imaOrgId);
  }

  const { data: existingProfile } = await service
    .from("user_profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingProfile) {
    console.error(`A user_profiles row already exists for ${email} — bootstrap already ran. Aborting.`);
    process.exit(1);
  }

  const tempPassword = generateTempPassword();
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });
  if (createError) throw createError;

  const { error: profileError } = await service.from("user_profiles").insert({
    auth_user_id: created.user.id,
    full_name: fullName,
    email,
    avatar_initials: computeInitials(fullName),
    organisation_id: imaOrgId,
    role: "ima_admin",
  });
  if (profileError) {
    await service.auth.admin.deleteUser(created.user.id);
    throw profileError;
  }

  console.log("\nBootstrap complete.");
  console.log("Email:", email);
  console.log("Temporary password:", tempPassword);
  console.log("Sign in and change this password immediately (Settings, or Forgot password on the login page).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
