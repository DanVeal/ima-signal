import { PageContainer, PageHeader, Section } from "@/components/nav/page-container";
import { createClient } from "@/lib/supabase/server";
import {
  getPramsSectionSummary,
  getPramsUpdate,
  getProjects,
} from "@/lib/supabase/repository";

// Requires a signed-in session (real Supabase Auth + RLS) — never prerendered at build time.
export const dynamic = "force-dynamic";

/**
 * Phase 2A proof-of-foundation, part two: the global PRAMS announcement
 * registry and per-update sections, read live from Supabase (RLS-scoped to
 * the signed-in user) rather than src/lib/mock/prams-library.ts.
 *
 * This is a separate route from the existing (mock-data-driven) PRAMS
 * project pages under /projects/[projectId] rather than a replacement for
 * them: those pages' ids, matrix, and audio/review state all still come
 * from the mock prototype (no scripts/audio/matrix tables exist yet — see
 * docs/phase-2a-limitations.md), so wiring this registry data into the
 * SAME ids would mean half the page was real and half mock. This route
 * proves the new tables end-to-end without that risk.
 */
export default async function PramsRegistryPage() {
  const supabase = await createClient();
  const projects = await getProjects(supabase);
  const pramsProject = projects.find((p) => p.type === "prams");

  if (!pramsProject) {
    return (
      <PageContainer>
        <PageHeader eyebrow="PRAMS" title="Announcement registry" />
        <p className="text-sm text-text-muted">No PRAMS project found in the database yet.</p>
      </PageContainer>
    );
  }

  const [update, sections] = await Promise.all([
    getPramsUpdate(supabase, pramsProject.id),
    getPramsSectionSummary(supabase, pramsProject.id),
  ]);

  const totalAnnouncements = sections.reduce((sum, s) => sum + s.variantCount, 0);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="PRAMS · Phase 2A foundation"
        title={pramsProject.name}
        description={
          update
            ? `${update.update_label} · status: ${update.status}`
            : "No prams_updates row found for this project."
        }
      />

      <Section
        title="Global announcement registry"
        description={`${totalAnnouncements} announcement variants across ${sections.length} sections — read live from prams_announcements / prams_announcement_versions / prams_sections.`}
      >
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="divide-y divide-border-subtle">
            {sections.map(({ section, variantCount }) => (
              <div key={section.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium text-ink-900">{section.name}</p>
                  <p className="text-xs text-text-muted">
                    {section.available ? "Transcribed from workbook" : "Structure only — not yet transcribed"}
                  </p>
                </div>
                <span className="text-sm tabular-nums text-text-secondary">
                  {variantCount} variant{variantCount === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </PageContainer>
  );
}
