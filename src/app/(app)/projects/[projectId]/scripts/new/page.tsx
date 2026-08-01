import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/nav/page-container";
import { NewScriptForm } from "@/components/scripts/new-script-form";
import { createClient } from "@/lib/supabase/server";
import { getProjectById } from "@/lib/supabase/repository";

// Requires a signed-in session (real Supabase Auth + RLS) — never prerendered at build time.
export const dynamic = "force-dynamic";

export default async function NewScriptPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();
  const project = await getProjectById(supabase, projectId);
  if (!project || project.type !== "standard_radio") notFound();

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Standard Radio"
        title={`New script — ${project.name}`}
        description="Author a script and its variants. Each variant starts as revision 1 — a wording change always creates a new revision."
      />
      <NewScriptForm projectId={projectId} />
    </PageContainer>
  );
}
