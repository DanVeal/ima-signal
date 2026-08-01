import Link from "next/link";
import { Mic, FolderClosed, ListTree, Rows3 } from "lucide-react";
import { PageContainer, PageHeader, Section } from "@/components/nav/page-container";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states/empty-state";
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
 * The global PRAMS announcement registry and per-update sections, read
 * live from Supabase (RLS-scoped to the signed-in user), plus the Boarding
 * matrix's live wording groups. Resolves to the oldest PRAMS project (see
 * getProjects' ordering) — a cross-project registry view is future work;
 * for now, a project's own page under /projects/[projectId] is the place
 * to manage a specific project's sections and import workbooks.
 */
export default async function PramsRegistryPage() {
  const supabase = await createClient();
  const projects = await getProjects(supabase);
  const pramsProject = projects.find((p) => p.type === "prams");

  if (!pramsProject) {
    return (
      <PageContainer>
        <PageHeader eyebrow="PRAMS" title="Announcement registry" />
        <EmptyState
          icon={FolderClosed}
          title="No PRAMS project found"
          description="Create a PRAMS project to see its announcement registry here."
          action={
            <Button size="sm" render={<Link href="/projects/new" />}>
              New project
            </Button>
          }
        />
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
        eyebrow="PRAMS"
        title={pramsProject.name}
        description={
          update
            ? `${update.update_label} · status: ${update.status}`
            : "No prams_updates row found for this project."
        }
        actions={
          <Button variant="outline" render={<Link href={`/projects/${pramsProject.id}/recordings`} />}>
            <Mic className="size-4" />
            Recordings
          </Button>
        }
      />

      <Section
        title="Global announcement registry"
        description={`${totalAnnouncements} announcement variants across ${sections.length} sections.`}
        className="mb-10"
      >
        {sections.length === 0 ? (
          <EmptyState
            icon={ListTree}
            title="No sections yet"
            description="Sections appear here once the update's structure has been imported."
            className="py-10"
          />
        ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="divide-y divide-border-subtle">
            {sections.map(({ section, variantCount }) => (
              <div key={section.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium text-text-primary">{section.name}</p>
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
        )}
      </Section>

      {boarding && (
        <Section
          title="Boarding matrix"
          description="Each row's current wording groups. Sharing shown here is a real membership relationship, never inferred from matching text."
        >
          {boardingMatrix.length === 0 ? (
            <EmptyState
              icon={Rows3}
              title="No matrix rows yet"
              description="Boarding matrix rows appear here once the section has been imported."
              className="py-10"
            />
          ) : (
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
                      <p className={group.text ? "text-sm text-text-primary" : "text-sm text-text-muted italic"}>
                        {group.text ?? "(intentionally blank)"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          )}
        </Section>
      )}
    </PageContainer>
  );
}
