import { notFound } from "next/navigation";
import { PageContainer } from "@/components/nav/page-container";
import { SettingsContent } from "@/components/settings/settings-content";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/repository";

// Requires a signed-in session (real Supabase Auth + RLS) — never prerendered at build time.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) notFound();

  const { count } = await supabase
    .from("user_profiles")
    .select("*", { count: "exact", head: true })
    .eq("organisation_id", profile.organisation_id);

  return (
    <PageContainer>
      <SettingsContent profile={profile} colleagueCount={count ?? 1} />
    </PageContainer>
  );
}
