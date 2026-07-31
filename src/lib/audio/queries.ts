/**
 * Read queries for the real audio domain — browsing, recording detail, and
 * dashboard stats. Kept separate from audio-upload/service.ts (the write
 * path) the same way Phase 2B split import-service.ts (write) from
 * comparison-service.ts (read). Every function takes a Supabase client so
 * RLS enforces access exactly as everywhere else in this codebase.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export interface RecordingVersionSummary {
  id: string;
  versionNumber: number;
  uploadedByUserId: string | null;
  originalFilename: string;
  durationSeconds: number | null;
  fileSizeBytes: number;
  codec: string | null;
  sampleRateHz: number | null;
  channels: number | null;
  bitRateBps: number | null;
  containerFormat: string | null;
  waveformPeaks: number[] | null;
  storagePath: string;
  restoredFromVersionId: string | null;
  createdAt: string;
}

export interface RecordingRow {
  subjectId: string;
  subjectType: "script_variant" | "announcement_version";
  code: string;
  label: string;
  audioItemId: string | null;
  currentVersion: RecordingVersionSummary | null;
}

function toVersionSummary(row: Database["public"]["Tables"]["audio_versions"]["Row"]): RecordingVersionSummary {
  return {
    id: row.id,
    versionNumber: row.version_number,
    uploadedByUserId: row.uploaded_by_user_id,
    originalFilename: row.original_filename,
    durationSeconds: row.duration_seconds,
    fileSizeBytes: row.file_size_bytes,
    codec: row.codec,
    sampleRateHz: row.sample_rate_hz,
    channels: row.channels,
    bitRateBps: row.bit_rate_bps,
    containerFormat: row.container_format,
    waveformPeaks: row.waveform_peaks as number[] | null,
    storagePath: row.storage_path,
    restoredFromVersionId: row.restored_from_version_id,
    createdAt: row.created_at,
  };
}

export async function getRecordingsForProject(supabase: Client, projectId: string): Promise<RecordingRow[]> {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("type")
    .eq("id", projectId)
    .single();
  if (projectError) throw projectError;

  if (project.type === "standard_radio") {
    const { data, error } = await supabase
      .from("script_variants")
      .select(
        "id, variant_code, destination, departure_airport, column_order, script:scripts!inner(project_id), audio_item:audio_items(id, current_version:audio_versions!audio_items_current_version_id_fkey(*))",
      )
      .eq("script.project_id", projectId)
      .order("column_order");
    if (error) throw error;
    return data.map((v) => ({
      subjectId: v.id,
      subjectType: "script_variant" as const,
      code: v.variant_code,
      label: [v.variant_code, [v.departure_airport, v.destination].filter(Boolean).join(" → ")]
        .filter(Boolean)
        .join(" — "),
      audioItemId: v.audio_item?.id ?? null,
      currentVersion: v.audio_item?.current_version ? toVersionSummary(v.audio_item.current_version) : null,
    }));
  }

  const { data, error } = await supabase
    .from("prams_announcement_versions")
    .select(
      "id, title_at_import, column_order, announcement:prams_announcements(reference_code), audio_item:audio_items(id, current_version:audio_versions!audio_items_current_version_id_fkey(*))",
    )
    .eq("project_id", projectId)
    .eq("status", "active")
    .order("column_order");
  if (error) throw error;
  return data.map((v) => ({
    subjectId: v.id,
    subjectType: "announcement_version" as const,
    code: v.announcement?.reference_code ?? "",
    label: `${v.announcement?.reference_code ?? "?"} — ${v.title_at_import}`,
    audioItemId: v.audio_item?.id ?? null,
    currentVersion: v.audio_item?.current_version ? toVersionSummary(v.audio_item.current_version) : null,
  }));
}

export interface AudioItemDetail {
  audioItemId: string;
  projectId: string;
  subjectType: "script_variant" | "announcement_version";
  code: string;
  label: string;
  currentVersionId: string | null;
  versions: RecordingVersionSummary[];
}

export async function getAudioItemDetail(supabase: Client, audioItemId: string): Promise<AudioItemDetail> {
  const { data: item, error: itemError } = await supabase
    .from("audio_items")
    .select(
      "id, current_version_id, script_variant:script_variants(id, variant_code, destination, departure_airport, script:scripts(project_id)), announcement_version:prams_announcement_versions(id, project_id, title_at_import, announcement:prams_announcements(reference_code))",
    )
    .eq("id", audioItemId)
    .single();
  if (itemError) throw itemError;

  const { data: versions, error: versionsError } = await supabase
    .from("audio_versions")
    .select("*")
    .eq("audio_item_id", audioItemId)
    .order("version_number", { ascending: false });
  if (versionsError) throw versionsError;

  const isScriptVariant = !!item.script_variant;
  const projectId = isScriptVariant
    ? item.script_variant!.script?.project_id
    : item.announcement_version!.project_id;
  if (!projectId) throw new Error("Could not resolve project for audio item");

  const code = isScriptVariant
    ? item.script_variant!.variant_code
    : item.announcement_version!.announcement?.reference_code ?? "";
  const label = isScriptVariant
    ? [
        item.script_variant!.variant_code,
        [item.script_variant!.departure_airport, item.script_variant!.destination].filter(Boolean).join(" → "),
      ]
        .filter(Boolean)
        .join(" — ")
    : `${code} — ${item.announcement_version!.title_at_import}`;

  return {
    audioItemId: item.id,
    projectId,
    subjectType: isScriptVariant ? "script_variant" : "announcement_version",
    code,
    label,
    currentVersionId: item.current_version_id,
    versions: versions.map(toVersionSummary),
  };
}

/** Batch-resolves uploader display names for a set of user_profiles ids — call once per page with every id you'll need, not per-row. */
export async function getUploaderNames(
  supabase: Client,
  userIds: (string | null)[],
): Promise<Map<string, { fullName: string; avatarInitials: string }>> {
  const ids = Array.from(new Set(userIds.filter((id): id is string => !!id)));
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("user_profiles").select("id, full_name, avatar_initials").in("id", ids);
  if (error) throw error;
  return new Map(data.map((u) => [u.id, { fullName: u.full_name, avatarInitials: u.avatar_initials }]));
}

export interface RecordingsDashboardStats {
  totalRecordings: number;
  totalUploads: number;
  missingAudioCount: number;
  latest: (RecordingVersionSummary & { projectId: string; projectName: string; label: string })[];
}

/** Across every project the signed-in user can access (RLS-scoped) — real counts, no mock. */
export async function getRecordingsDashboardStats(
  supabase: Client,
  limit: number = 6,
): Promise<RecordingsDashboardStats> {
  const [
    { count: totalUploads },
    { count: totalCurrentRecordings },
    { count: totalVariants },
    { count: totalAnnouncementVersions },
    { data: latestVersions, error: latestError },
  ] = await Promise.all([
    supabase.from("audio_versions").select("id", { count: "exact", head: true }),
    supabase.from("audio_items").select("id", { count: "exact", head: true }).not("current_version_id", "is", null),
    supabase.from("script_variants").select("id", { count: "exact", head: true }),
    supabase
      .from("prams_announcement_versions")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("audio_versions")
      .select(
        "*, audio_item:audio_items!audio_versions_audio_item_id_fkey!inner(script_variant:script_variants(variant_code, destination, departure_airport, script:scripts(project_id, project:projects(name))), announcement_version:prams_announcement_versions(project_id, title_at_import, project:projects(name), announcement:prams_announcements(reference_code)))",
      )
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);
  if (latestError) throw latestError;

  const totalSubjects = (totalVariants ?? 0) + (totalAnnouncementVersions ?? 0);
  const missingAudioCount = Math.max(0, totalSubjects - (totalCurrentRecordings ?? 0));

  const latest = latestVersions.map((v) => {
    const sv = v.audio_item?.script_variant;
    const av = v.audio_item?.announcement_version;
    const projectId = sv?.script?.project_id ?? av?.project_id ?? "";
    const projectName = sv?.script?.project?.name ?? av?.project?.name ?? "";
    const label = sv
      ? [sv.variant_code, [sv.departure_airport, sv.destination].filter(Boolean).join(" → ")]
          .filter(Boolean)
          .join(" — ")
      : `${av?.announcement?.reference_code ?? "?"} — ${av?.title_at_import ?? ""}`;
    return { ...toVersionSummary(v), projectId, projectName, label };
  });

  return {
    totalRecordings: totalCurrentRecordings ?? 0,
    totalUploads: totalUploads ?? 0,
    missingAudioCount,
    latest,
  };
}
