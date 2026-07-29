import { PageContainer, PageHeader } from "@/components/nav/page-container";
import { NewProjectFlow } from "@/components/projects/new-project-flow";

export default function NewProjectPage() {
  return (
    <PageContainer>
      <PageHeader eyebrow="Projects" title="New project" description="Start a Standard Radio campaign or a PRAMS update." />
      <NewProjectFlow />
    </PageContainer>
  );
}
