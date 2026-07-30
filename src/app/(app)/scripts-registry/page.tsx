import { PageContainer, PageHeader, Section } from "@/components/nav/page-container";
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
        <p className="text-sm text-text-muted">No Standard Radio project found in the database yet.</p>
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
        eyebrow="Standard Radio · Phase 2B foundation"
        title={standardRadioProject.name}
        description="Script -> variant -> revision -> ordered lines, read live from scripts / script_variants / script_revisions / script_lines. Every revision is immutable once written — a wording change always creates a new one."
      />

      <Section
        title="Variants"
        description={`${variantsWithRevisions.length} variants across ${scripts.length} script${scripts.length === 1 ? "" : "s"}.`}
      >
        <div className="space-y-3">
          {variantsWithRevisions.map(({ script, variant, revision }) => (
            <div key={variant.id} className="rounded-lg border border-border p-4">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink-900">
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
                    <p key={line.id} className="text-sm text-ink-900">
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
      </Section>
    </PageContainer>
  );
}
