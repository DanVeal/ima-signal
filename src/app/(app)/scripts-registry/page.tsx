import Link from "next/link";
import { Mic, FolderClosed, FileText } from "lucide-react";
import { PageContainer, PageHeader, Section } from "@/components/nav/page-container";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states/empty-state";
import { createClient } from "@/lib/supabase/server";
import { getLatestRevisionWithLines, getProjects, getScriptsForProject } from "@/lib/supabase/repository";

// Requires a signed-in session (real Supabase Auth + RLS) — never prerendered at build time.
export const dynamic = "force-dynamic";

/**
 * Standard Radio's script -> variant -> revision -> ordered-lines chain,
 * read live from Supabase. Resolves to the oldest Standard Radio project
 * (see getProjects' ordering) — a cross-project registry view is future
 * work; for now, a project's own page under /projects/[projectId] is the
 * place to manage a specific project's scripts.
 */
export default async function ScriptsRegistryPage() {
  const supabase = await createClient();
  const projects = await getProjects(supabase);
  const standardRadioProject = projects.find((p) => p.type === "standard_radio");

  if (!standardRadioProject) {
    return (
      <PageContainer>
        <PageHeader eyebrow="Standard Radio" title="Scripts" />
        <EmptyState
          icon={FolderClosed}
          title="No Standard Radio project found"
          description="Create a Standard Radio project to see its scripts here."
          action={
            <Button size="sm" render={<Link href="/projects/new" />}>
              New project
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const scripts = await getScriptsForProject(supabase, standardRadioProject.id);
  const variantsWithRevisions = await Promise.all(
    scripts.flatMap((script) =>
      script.script_variants.map(async (variant) => ({
        script,
        variant,
        revision: await getLatestRevisionWithLines(supabase, variant.id),
      })),
    ),
  );

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Standard Radio"
        title={standardRadioProject.name}
        description="Script → variant → revision → ordered lines. Every revision is immutable once written — a wording change always creates a new one."
        actions={
          <Button variant="outline" render={<Link href={`/projects/${standardRadioProject.id}/recordings`} />}>
            <Mic className="size-4" />
            Recordings
          </Button>
        }
      />

      <Section
        title="Variants"
        description={`${variantsWithRevisions.length} variants across ${scripts.length} script${scripts.length === 1 ? "" : "s"}.`}
      >
        {variantsWithRevisions.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No variants yet"
            description="Script variants appear here once they've been added to this project."
            className="py-10"
          />
        ) : (
        <div className="space-y-3">
          {variantsWithRevisions.map(({ script, variant, revision }) => (
            <div key={variant.id} className="rounded-lg border border-border p-4">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {variant.variant_code}
                    <span className="ml-2 text-xs font-normal text-text-muted">{script.title}</span>
                  </p>
                  <p className="text-xs text-text-muted">
                    {[variant.departure_airport, variant.destination].filter(Boolean).join(" → ")}
                  </p>
                </div>
                {revision && (
                  <span className="shrink-0 text-xs tabular-nums text-text-secondary">
                    revision {revision.revision_number}
                    {revision.is_approved_for_recording ? " · approved for recording" : ""}
                  </span>
                )}
              </div>
              {revision ? (
                <div className="space-y-1 rounded-md bg-surface-sunken px-3 py-2">
                  {revision.script_lines.map((line) => (
                    <p key={line.id} className="text-sm text-text-primary">
                      {line.text}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted italic">No revision yet.</p>
              )}
            </div>
          ))}
        </div>
        )}
      </Section>
    </PageContainer>
  );
}
