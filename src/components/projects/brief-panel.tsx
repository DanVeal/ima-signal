import { ScrollText, ShieldAlert, Sparkles } from "lucide-react";
import type { Project } from "@/types/domain";

export function BriefPanel({ project }: { project: Project }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 rounded-lg border border-border bg-surface-raised p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <ScrollText className="size-4 text-brand" />
          Briefing notes
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">{project.briefingNotes}</p>
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-border-subtle pt-4 text-sm">
          <div>
            <dt className="text-xs text-text-muted">Expected duration</dt>
            <dd className="text-ink-800">{project.expectedDurationSeconds}s</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Audio format</dt>
            <dd className="text-ink-800">{project.audioFormat}</dd>
          </div>
        </dl>
        {project.deliveryNotes && (
          <div className="mt-4 border-t border-border-subtle pt-4 text-sm">
            <dt className="text-xs text-text-muted">Delivery notes</dt>
            <dd className="mt-1 text-ink-800">{project.deliveryNotes}</dd>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border border-important/25 bg-important-100 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-important">
            <ShieldAlert className="size-4" />
            Mandatory wording
          </h3>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-800">
            {project.mandatoryWording.map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden className="text-important">
                  ▸
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-brand/20 bg-brand-100 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-brand">
            <Sparkles className="size-4" />
            Important claims
          </h3>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-800">
            {project.importantClaims.map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden className="text-brand">
                  ▸
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
