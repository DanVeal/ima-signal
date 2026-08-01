import { PageContainer, PageHeader } from "@/components/nav/page-container";
import { NewProjectFlow } from "@/components/projects/new-project-flow";
import { createClient } from "@/lib/supabase/server";
import { getCampaigns, getOrganisations } from "@/lib/supabase/repository";

// Requires a signed-in session (real Supabase Auth + RLS) — never prerendered at build time.
export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const supabase = await createClient();
  const [campaigns, organisations] = await Promise.all([getCampaigns(supabase), getOrganisations(supabase)]);

  return (
    <PageContainer>
      <PageHeader eyebrow="Projects" title="New project" description="Start a Standard Radio campaign or a PRAMS update." />
      <NewProjectFlow campaigns={campaigns} organisations={organisations} />
    </PageContainer>
  );
}
