import { PageContainer } from "@/components/nav/page-container";
import { ProjectsListContent } from "@/components/projects/projects-list-content";
import { createClient } from "@/lib/supabase/server";
import { getProjectsOverview } from "@/lib/projects/queries";

// Requires a signed-in session (real Supabase Auth + RLS) — never prerendered at build time.
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const supabase = await createClient();
  const projects = await getProjectsOverview(supabase);
  return (
    <PageContainer>
      <ProjectsListContent projects={projects} />
    </PageContainer>
  );
}
