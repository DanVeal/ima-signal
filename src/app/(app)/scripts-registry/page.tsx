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
 * Phase 2B proof-of-foundation: Standard Radio's script -> variant ->
 * revision -> ordered-lines chain, read live from Supabase, mirroring
 * /prams-registry's role for the PRAMS side.
 *
 * A separate route from the existing (mock-data-driven) Standard Radio
 * project pages under /projects/[projectId] rather than a replacement for
 * them, for the same reason /prams-registry is separate from the PRAMS
 * project pages: those pages' audio/review/approval state still comes from
 * the mock prototype (no audio tables exist yet), so wiring this data into
 * the SAME ids would mean half the page was real and half mock — see
 * docs/phase-2b-limitations.md.
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
