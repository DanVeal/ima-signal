import { PageContainer, PageHeader, Section } from "@/components/nav/page-container";
import { createClient } from "@/lib/supabase/server";
import {
  getMatrixForSection,
  getPramsSectionSummary,
  getPramsUpdate,
  getProjects,
} from "@/lib/supabase/repository";

// Requires a signed-in session (real Supabase Auth + RLS) — never prerendered at build time.
export const dynamic = "force-dynamic";

/**
 * Phase 2A proof-of-foundation, part two: the global PRAMS announcement
 * registry and per-update sections, read live from Supabase (RLS-scoped to
 * the signed-in user) rather than src/lib/mock/prams-library.ts. Phase 2B
 * extends it with the Boarding matrix's live wording groups (below).
 *
 * This is a separate route from the existing (mock-data-driven) PRAMS
 * project pages under /projects/[projectId] rather than a replacement for
 * them: those pages' ids, matrix, and audio/review state all still come
 * from the mock prototype, so wiring this data into the SAME ids would mean
 * half the page was real and half mock — see docs/phase-2b-limitations.md.
 * This route proves the new tables end-to-end without that risk.
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
  const boarding = sections.find(({ section }) => section.slug === "boarding");
  const boardingMatrix = boarding ? await getMatrixForSection(supabase, boarding.section.id) : [];

  return (
    <PageContainer>
      <PageHeader
        eyebrow="PRAMS · Phase 2A + 2B foundation"
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
        className="mb-10"
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

      {boarding && (
        <Section
          title="Boarding matrix (live)"
          description="Each row's CURRENT wording groups — read from prams_matrix_rows / prams_matrix_cells / prams_wording_groups / prams_wording_group_members. Sharing shown here is a real membership relationship, never inferred from matching text."
        >
          <div className="space-y-3">
            {boardingMatrix.map(({ row, groups }) => (
              <div key={row.id} className="rounded-lg border border-border p-4">
                <p className="mb-2 text-xs font-medium tracking-wide text-text-muted uppercase">{row.row_key}</p>
                <div className="space-y-2">
                  {groups.map((group, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-md bg-surface-sunken px-3 py-2">
                      <div className="flex shrink-0 flex-wrap gap-1">
                        {group.referenceCodes.map((code) => (
                          <span
                            key={code}
                            className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-700"
                          >
                            {code}
                          </span>
                        ))}
                      </div>
                      <p className={group.text ? "text-sm text-ink-900" : "text-sm text-text-muted italic"}>
                        {group.text ?? "(intentionally blank)"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </PageContainer>
  );
}
