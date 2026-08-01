import { PageContainer } from "@/components/nav/page-container";
import { PermissionDeniedState } from "@/components/states/error-state";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile, getOrganisations } from "@/lib/supabase/repository";
import { getAdminUserList } from "@/lib/admin/queries";
import { AdminContent } from "@/components/admin/admin-content";

// Requires a signed-in session (real Supabase Auth + RLS) — never prerendered at build time.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);

  if (!profile || profile.role !== "ima_admin") {
    return (
      <PageContainer>
        <PermissionDeniedState
          className="mt-10"
          title="Admin area"
          description="Only an IMA Admin can create accounts, disable users, and manage roles. Ask your IMA Admin if you need something changed here."
        />
      </PageContainer>
    );
  }

  const [users, organisations] = await Promise.all([getAdminUserList(supabase), getOrganisations(supabase)]);

  return (
    <PageContainer>
      <AdminContent users={users} organisations={organisations} currentUserProfileId={profile.id} />
    </PageContainer>
  );
}
