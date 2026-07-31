"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  List,
  Loader2,
  Mic,
  MoreHorizontal,
  Rows3,
  Search,
  Sparkles,
  Table as TableIcon,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/states/empty-state";
import { StaticWaveform } from "@/components/audio/static-waveform";
import { formatDateTime, formatDuration, formatFileSize } from "@/lib/format";
import { requestBulkTranscription } from "@/lib/intelligence/actions";
import { useLocalStorageState } from "@/lib/use-local-storage-state";
import type { AiJobBatchStatus } from "@/lib/intelligence/queries";
import type { RecordingRow } from "@/lib/audio/queries";
import type { Database } from "@/lib/supabase/database.types";

type HealthRating = Database["public"]["Enums"]["health_rating"];
type ViewMode = "list" | "compact" | "table";
type SortKey = "code" | "duration" | "uploaded" | "health";
type FilterKey = "all" | "has_audio" | "missing_audio" | "needs_attention";

const JOB_STATUS_LABEL: Record<string, string> = {
  queued: "Transcript queued",
  processing: "Transcribing…",
  completed: "Transcribed",
  failed: "Transcript failed",
  cancelled: "Transcript cancelled",
};

const HEALTH_LABEL: Record<HealthRating, string> = {
  excellent: "Excellent",
  good: "Good",
  needs_review: "Needs review",
  attention_required: "Attention required",
};

const HEALTH_CLASS: Record<HealthRating, string> = {
  excellent: "border-emerald-300/50 text-emerald-700 dark:text-emerald-300",
  good: "border-brand/30 text-brand",
  needs_review: "border-amber-300/60 text-amber-700 dark:text-amber-300",
  attention_required: "border-red-300/60 text-red-700 dark:text-red-300",
};

const HEALTH_SEVERITY: Record<HealthRating, number> = {
  attention_required: 0,
  needs_review: 1,
  good: 2,
  excellent: 3,
};

const FILTER_OPTIONS: { value: FilterKey; label: string }[] = [
  { value: "all", label: "All recordings" },
  { value: "has_audio", label: "Has audio" },
  { value: "missing_audio", label: "Missing audio" },
  { value: "needs_attention", label: "Needs attention" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "code", label: "Name (A–Z)" },
  { value: "uploaded", label: "Recently uploaded" },
  { value: "duration", label: "Duration" },
  { value: "health", label: "Health (worst first)" },
];

const DEFAULT_COLUMNS = {
  duration: true,
  version: true,
  health: true,
  uploader: true,
  uploadedAt: true,
  fileSize: false,
};
type ColumnKey = keyof typeof DEFAULT_COLUMNS;
const COLUMN_LABEL: Record<ColumnKey, string> = {
  duration: "Duration",
  version: "Version",
  health: "Health",
  uploader: "Uploader",
  uploadedAt: "Uploaded",
  fileSize: "File size",
};

interface SavedFilter {
  id: string;
  name: string;
  search: string;
  sort: SortKey;
  filter: FilterKey;
}

export function RecordingsBrowser({
  projectId,
  rows,
  uploaders,
  jobStatusByVersionId,
  healthByVersionId,
  canGenerate,
}: {
  projectId: string;
  rows: RecordingRow[];
  uploaders: Map<string, { fullName: string; avatarInitials: string }>;
  jobStatusByVersionId: Map<string, AiJobBatchStatus>;
  healthByVersionId: Map<string, HealthRating>;
  canGenerate: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("code");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [viewMode, setViewMode] = useLocalStorageState<ViewMode>("ima-signal.recordings-view", "list");
  const [columns, setColumns] = useLocalStorageState<Record<ColumnKey, boolean>>(
    "ima-signal.recordings-columns",
    DEFAULT_COLUMNS,
  );
  const [savedFilters, setSavedFilters] = useLocalStorageState<SavedFilter[]>(
    `ima-signal.recordings-saved-filters.${projectId}`,
    [],
  );

  function health(row: RecordingRow) {
    return row.currentVersion ? healthByVersionId.get(row.currentVersion.id) : undefined;
  }

  const filteredRows = useMemo(() => {
    let result = rows;
    if (filter === "has_audio") result = result.filter((r) => !!r.currentVersion);
    else if (filter === "missing_audio") result = result.filter((r) => !r.currentVersion);
    else if (filter === "needs_attention") {
      result = result.filter((r) => {
        const h = health(r);
        return h === "needs_review" || h === "attention_required";
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((r) => r.code.toLowerCase().includes(q) || r.label.toLowerCase().includes(q));
    }
    const sorted = [...result];
    sorted.sort((a, b) => {
      if (sort === "duration") {
        return (b.currentVersion?.durationSeconds ?? -1) - (a.currentVersion?.durationSeconds ?? -1);
      }
      if (sort === "uploaded") {
        return (b.currentVersion?.createdAt ?? "").localeCompare(a.currentVersion?.createdAt ?? "");
      }
      if (sort === "health") {
        const aSeverity = health(a) ? HEALTH_SEVERITY[health(a)!] : 4;
        const bSeverity = health(b) ? HEALTH_SEVERITY[health(b)!] : 4;
        return aSeverity - bSeverity;
      }
      return a.code.localeCompare(b.code);
    });
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filter, search, sort, healthByVersionId]);

  const selectableIds = filteredRows.map((r) => r.currentVersion?.id).filter((id): id is string => !!id);
  const hasFilters = search.trim().length > 0 || filter !== "all";

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === selectableIds.length && prev.size > 0 ? new Set() : new Set(selectableIds)));
  }

  async function generateFor(ids: string[]) {
    if (ids.length === 0) return;
    setSubmitting(true);
    try {
      await requestBulkTranscription(ids);
      setSelected(new Set());
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  function saveCurrentFilter() {
    const name = window.prompt("Name this filter");
    if (!name?.trim()) return;
    setSavedFilters((prev) => [...prev, { id: crypto.randomUUID(), name: name.trim(), search, sort, filter }]);
  }

  function applySavedFilter(saved: SavedFilter) {
    setSearch(saved.search);
    setSort(saved.sort);
    setFilter(saved.filter);
  }

  function removeSavedFilter(id: string) {
    setSavedFilters((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recordings…"
            className="h-9 pl-9"
            aria-label="Search recordings"
          />
        </div>

        <Select value={filter} onValueChange={(v) => setFilter((v as FilterKey) ?? "all")}>
          <SelectTrigger className="h-9 w-40" aria-label="Filter recordings">
            <SelectValue>{(value: FilterKey) => FILTER_OPTIONS.find((o) => o.value === value)?.label ?? value}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {FILTER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => setSort((v as SortKey) ?? "code")}>
          <SelectTrigger className="h-9 w-44" aria-label="Sort recordings">
            <SelectValue>{(value: SortKey) => SORT_OPTIONS.find((o) => o.value === value)?.label ?? value}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {savedFilters.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>Saved filters</DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {savedFilters.map((saved) => (
                <DropdownMenuItem key={saved.id} onClick={() => applySavedFilter(saved)} className="justify-between gap-4">
                  {saved.name}
                  <button
                    type="button"
                    aria-label={`Remove saved filter ${saved.name}`}
                    className="text-text-muted hover:text-critical"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSavedFilter(saved.id);
                    }}
                  >
                    ×
                  </button>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={saveCurrentFilter}>
            Save filter
          </Button>
        )}

        <div className="ml-auto flex items-center gap-1">
          {viewMode === "table" && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>Columns</DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {(Object.keys(DEFAULT_COLUMNS) as ColumnKey[]).map((key) => (
                    <DropdownMenuCheckboxItem
                      key={key}
                      checked={columns[key]}
                      onCheckedChange={(checked) => setColumns((prev) => ({ ...prev, [key]: checked }))}
                    >
                      {COLUMN_LABEL[key]}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <div className="flex items-center rounded-lg border border-border p-0.5">
            <ViewToggleButton icon={List} label="List" active={viewMode === "list"} onClick={() => setViewMode("list")} />
            <ViewToggleButton
              icon={Rows3}
              label="Compact"
              active={viewMode === "compact"}
              onClick={() => setViewMode("compact")}
            />
            <ViewToggleButton
              icon={TableIcon}
              label="Table"
              active={viewMode === "table"}
              onClick={() => setViewMode("table")}
            />
          </div>
        </div>
      </div>

      {canGenerate && (
        <div className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-sunken px-3 py-2">
          <Checkbox
            checked={selected.size > 0 && selected.size === selectableIds.length}
            onCheckedChange={toggleAll}
            disabled={selectableIds.length === 0}
          />
          <span className="text-xs text-text-secondary">
            {selected.size > 0 ? `${selected.size} selected` : "Select recordings to generate transcripts in bulk"}
          </span>
          <Button
            size="sm"
            className="ml-auto"
            disabled={selected.size === 0 || submitting}
            onClick={() => generateFor(Array.from(selected))}
          >
            {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            Generate {selected.size > 0 ? `${selected.size} ` : ""}transcript{selected.size === 1 ? "" : "s"}
          </Button>
        </div>
      )}

      {filteredRows.length === 0 ? (
        <EmptyState
          icon={Mic}
          title={hasFilters ? "No recordings match" : "No recordings yet"}
          description={
            hasFilters
              ? "Try widening your search or filter."
              : "Upload the studio's first take to get started."
          }
          action={
            !hasFilters && (
              <Button size="sm" render={<Link href={`/projects/${projectId}/recordings/upload`} />}>
                Upload a recording
              </Button>
            )
          }
        />
      ) : viewMode === "table" ? (
        <TableView
          rows={filteredRows}
          projectId={projectId}
          uploaders={uploaders}
          jobStatusByVersionId={jobStatusByVersionId}
          healthByVersionId={healthByVersionId}
          canGenerate={canGenerate}
          selected={selected}
          onToggle={toggle}
          columns={columns}
          onGenerateOne={(id) => generateFor([id])}
        />
      ) : (
        <ListView
          rows={filteredRows}
          projectId={projectId}
          uploaders={uploaders}
          jobStatusByVersionId={jobStatusByVersionId}
          healthByVersionId={healthByVersionId}
          canGenerate={canGenerate}
          selected={selected}
          onToggle={toggle}
          compact={viewMode === "compact"}
          onGenerateOne={(id) => generateFor([id])}
        />
      )}
    </div>
  );
}

function ViewToggleButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${label} view`}
      aria-pressed={active}
      onClick={onClick}
      className={`flex size-8 items-center justify-center rounded-md transition-colors ${
        active ? "bg-ink-900 text-white" : "text-text-muted hover:bg-ink-100"
      }`}
    >
      <Icon className="size-4" />
    </button>
  );
}

interface SharedRowProps {
  rows: RecordingRow[];
  projectId: string;
  uploaders: Map<string, { fullName: string; avatarInitials: string }>;
  jobStatusByVersionId: Map<string, AiJobBatchStatus>;
  healthByVersionId: Map<string, HealthRating>;
  canGenerate: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onGenerateOne: (id: string) => void;
}

function QuickActionsMenu({
  row,
  projectId,
  canGenerate,
  onGenerateOne,
}: {
  row: RecordingRow;
  projectId: string;
  canGenerate: boolean;
  onGenerateOne: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" onClick={(e: React.MouseEvent) => e.stopPropagation()} />}
        aria-label="Quick actions"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {row.audioItemId && (
          <DropdownMenuItem render={<Link href={`/projects/${projectId}/recordings/${row.audioItemId}`} />}>
            Open recording
          </DropdownMenuItem>
        )}
        {canGenerate && row.currentVersion && (
          <DropdownMenuItem onClick={() => onGenerateOne(row.currentVersion!.id)}>
            Generate transcript
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ListView({ rows, projectId, uploaders, jobStatusByVersionId, healthByVersionId, canGenerate, selected, onToggle, onGenerateOne, compact }: SharedRowProps & { compact: boolean }) {
  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const v = row.currentVersion;
        const uploader = v?.uploadedByUserId ? uploaders.get(v.uploadedByUserId) : undefined;
        const jobStatus = v ? jobStatusByVersionId.get(v.id) : undefined;
        const health = v ? healthByVersionId.get(v.id) : undefined;
        return (
          <div
            key={row.subjectId}
            className={`group flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-4 transition-colors ${
              compact ? "py-2" : "py-3"
            } ${row.audioItemId ? "hover:border-brand/40 hover:bg-brand-100/10" : "opacity-70"}`}
          >
            {canGenerate && v && (
              <Checkbox checked={selected.has(v.id)} onCheckedChange={() => onToggle(v.id)} onClick={(e) => e.stopPropagation()} />
            )}
            <Link
              href={row.audioItemId ? `/projects/${projectId}/recordings/${row.audioItemId}` : "#"}
              className="flex min-w-0 flex-1 items-center gap-4"
              aria-disabled={!row.audioItemId}
            >
              <div className="w-36 shrink-0">
                <p className="truncate text-sm font-medium text-text-primary">{row.code}</p>
                <p className="truncate text-xs text-text-muted">{row.label.replace(`${row.code} — `, "")}</p>
              </div>

              {!compact && (
                <div className="min-w-0 flex-1">
                  {v ? (
                    <StaticWaveform peaks={v.waveformPeaks} barClassName="bg-ink-300 group-hover:bg-brand/60 transition-colors" />
                  ) : (
                    <div className="flex h-8 items-center gap-2 text-xs text-text-muted">
                      <Mic className="size-3.5" />
                      No recording yet
                    </div>
                  )}
                </div>
              )}
              {compact && <div className="min-w-0 flex-1" />}

              {v && (
                <>
                  <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-text-secondary">
                    {v.durationSeconds != null ? formatDuration(v.durationSeconds) : "—"}
                  </span>
                  <Badge variant="outline" className="shrink-0">
                    v{v.versionNumber}
                  </Badge>
                  {health && (
                    <Badge variant="outline" className={`hidden shrink-0 text-[10px] sm:inline-flex ${HEALTH_CLASS[health]}`}>
                      {HEALTH_LABEL[health]}
                    </Badge>
                  )}
                  {jobStatus && !health && (
                    <Badge variant="outline" className="hidden shrink-0 text-[10px] sm:inline-flex">
                      {jobStatus.status === "processing" && <Loader2 className="size-3 animate-spin" />}
                      {JOB_STATUS_LABEL[jobStatus.status] ?? jobStatus.status}
                    </Badge>
                  )}
                  {!compact && (
                    <div className="flex w-40 shrink-0 items-center gap-2">
                      {uploader && (
                        <Avatar className="size-6">
                          <AvatarFallback className="bg-ink-100 text-[10px] font-medium text-ink-700">
                            {uploader.avatarInitials}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-xs text-text-secondary">{uploader?.fullName ?? "Unknown"}</p>
                        <p className="truncate text-[11px] text-text-muted">
                          {formatDateTime(v.createdAt)} · {formatFileSize(v.fileSizeBytes)}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </Link>
            <QuickActionsMenu row={row} projectId={projectId} canGenerate={canGenerate} onGenerateOne={onGenerateOne} />
          </div>
        );
      })}
    </div>
  );
}

function TableView({
  rows,
  projectId,
  uploaders,
  jobStatusByVersionId,
  healthByVersionId,
  canGenerate,
  selected,
  onToggle,
  onGenerateOne,
  columns,
}: SharedRowProps & { columns: Record<ColumnKey, boolean> }) {
  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {canGenerate && <TableHead className="w-8" />}
            <TableHead>Recording</TableHead>
            {columns.duration && <TableHead>Duration</TableHead>}
            {columns.version && <TableHead>Version</TableHead>}
            {columns.health && <TableHead>Health</TableHead>}
            {columns.uploader && <TableHead>Uploader</TableHead>}
            {columns.uploadedAt && <TableHead>Uploaded</TableHead>}
            {columns.fileSize && <TableHead>Size</TableHead>}
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const v = row.currentVersion;
            const uploader = v?.uploadedByUserId ? uploaders.get(v.uploadedByUserId) : undefined;
            const jobStatus = v ? jobStatusByVersionId.get(v.id) : undefined;
            const health = v ? healthByVersionId.get(v.id) : undefined;
            return (
              <TableRow
                key={row.subjectId}
                data-state={v && selected.has(v.id) ? "selected" : undefined}
                className={row.audioItemId ? "cursor-pointer" : "opacity-70"}
                onClick={() => {
                  if (row.audioItemId) window.location.assign(`/projects/${projectId}/recordings/${row.audioItemId}`);
                }}
              >
                {canGenerate && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {v && <Checkbox checked={selected.has(v.id)} onCheckedChange={() => onToggle(v.id)} />}
                  </TableCell>
                )}
                <TableCell className="whitespace-normal">
                  <p className="font-medium text-text-primary">{row.code}</p>
                  <p className="text-xs text-text-muted">{row.label.replace(`${row.code} — `, "")}</p>
                </TableCell>
                {columns.duration && (
                  <TableCell className="font-mono tabular-nums">
                    {v?.durationSeconds != null ? formatDuration(v.durationSeconds) : "—"}
                  </TableCell>
                )}
                {columns.version && <TableCell>{v ? `v${v.versionNumber}` : "—"}</TableCell>}
                {columns.health && (
                  <TableCell>
                    {health ? (
                      <Badge variant="outline" className={`text-[10px] ${HEALTH_CLASS[health]}`}>
                        {HEALTH_LABEL[health]}
                      </Badge>
                    ) : jobStatus ? (
                      <Badge variant="outline" className="text-[10px]">
                        {JOB_STATUS_LABEL[jobStatus.status] ?? jobStatus.status}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                )}
                {columns.uploader && <TableCell>{uploader?.fullName ?? "—"}</TableCell>}
                {columns.uploadedAt && <TableCell>{v ? formatDateTime(v.createdAt) : "—"}</TableCell>}
                {columns.fileSize && <TableCell>{v ? formatFileSize(v.fileSizeBytes) : "—"}</TableCell>}
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <QuickActionsMenu row={row} projectId={projectId} canGenerate={canGenerate} onGenerateOne={onGenerateOne} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
