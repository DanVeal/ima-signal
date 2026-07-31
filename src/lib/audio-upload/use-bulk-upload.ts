"use client";

/**
 * Client-side bulk upload orchestration: hashing (for duplicate detection),
 * filename matching, a concurrency-capped upload pipeline with real
 * per-file byte progress (XHR, not fetch — fetch has no reliable upload
 * progress event), retry, and cancel. Comfortably handles 150+ files: rows
 * are keyed in a Map for O(1) updates, and only MAX_CONCURRENT_UPLOADS
 * files are ever mid-flight at once, so the UI thread and the network are
 * never asked to do 150 things at the same instant.
 *
 * Nothing here writes anything visible as "imported" until the caller
 * explicitly starts the pipeline (startImport) — matching is preview-only.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { finalizeUpload, requestUploadSlot } from "./actions";
import { matchFiles, summarizeMatches, type MatchResult, type MatchTarget } from "./matcher";
import type { FinalizedUpload } from "./service";

const MAX_CONCURRENT_UPLOADS = 4;

export type UploadRowStatus =
  | "hashing"
  | "matched"
  | "queued"
  | "uploading"
  | "processing"
  | "done"
  | "error"
  | "canceled";

export interface UploadRow {
  id: string;
  file: File;
  fileName: string;
  fileSizeBytes: number;
  checksum: string | null;
  match: MatchResult | null;
  status: UploadRowStatus;
  progress: number;
  error: string | null;
  finalized: FinalizedUpload | null;
  xhr: XMLHttpRequest | null;
}

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** PUT with a FormData body, matching what Supabase's own uploadToSignedUrl sends — but via XHR so we get real progress and a real abort(). */
function uploadWithProgress(
  signedUrl: string,
  file: File,
  onProgress: (pct: number) => void,
): { promise: Promise<void>; xhr: XMLHttpRequest } {
  const xhr = new XMLHttpRequest();
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", file, file.name);

  const promise = new Promise<void>((resolve, reject) => {
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`));
    });
    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.addEventListener("abort", () => reject(new DOMException("Upload canceled", "AbortError")));
    xhr.open("PUT", signedUrl);
    xhr.send(form);
  });

  return { promise, xhr };
}

export function useBulkUpload(targets: MatchTarget[]) {
  const [rows, setRows] = useState<Map<string, UploadRow>>(new Map());
  const activeCountRef = useRef(0);
  const queueRef = useRef<string[]>([]);
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const pumpRef = useRef<() => void>(() => {});

  const patchRow = useCallback((id: string, patch: Partial<UploadRow>) => {
    setRows((prev) => {
      const existing = prev.get(id);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(id, { ...existing, ...patch });
      return next;
    });
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      const newRows: UploadRow[] = files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        fileName: file.name,
        fileSizeBytes: file.size,
        checksum: null,
        match: null,
        status: "hashing",
        progress: 0,
        error: null,
        finalized: null,
        xhr: null,
      }));

      setRows((prev) => {
        const next = new Map(prev);
        for (const row of newRows) next.set(row.id, row);
        return next;
      });

      // Hash concurrently (cheap, CPU-bound, no network) then re-run
      // matching over the WHOLE current set so in-batch duplicate/
      // collision detection sees every file, not just this add() call.
      await Promise.all(
        newRows.map(async (row) => {
          const checksum = await sha256Hex(row.file);
          patchRow(row.id, { checksum });
        }),
      );

      setRows((prev) => {
        const allRows = Array.from(prev.values());
        const candidates = allRows.map((r) => ({
          fileName: r.fileName,
          fileSizeBytes: r.fileSizeBytes,
          checksum: r.checksum ?? "",
        }));
        const results = matchFiles(candidates, targets);
        const next = new Map(prev);
        allRows.forEach((r, i) => {
          next.set(r.id, { ...r, match: results[i], status: "matched" });
        });
        return next;
      });
    },
    [targets, patchRow],
  );

  const removeRow = useCallback((id: string) => {
    setRows((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const runPipeline = useCallback(
    async (id: string) => {
      const row = rowsRef.current.get(id);
      if (!row || !row.match?.target) return;

      patchRow(id, { status: "uploading", progress: 0, error: null });
      try {
        const subject =
          row.match.target.subjectType === "script_variant"
            ? { scriptVariantId: row.match.target.subjectId }
            : { announcementVersionId: row.match.target.subjectId };
        const slot = await requestUploadSlot(subject, row.fileName);

        const { promise, xhr } = uploadWithProgress(slot.signedUrl, row.file, (pct) =>
          patchRow(id, { progress: pct }),
        );
        patchRow(id, { xhr });
        await promise;

        patchRow(id, { status: "processing", progress: 100, xhr: null });
        const finalized = await finalizeUpload(slot.audioItemId, slot.storagePath, row.fileName);
        patchRow(id, { status: "done", finalized });
      } catch (err) {
        const canceled = err instanceof DOMException && err.name === "AbortError";
        patchRow(id, {
          status: canceled ? "canceled" : "error",
          error: canceled ? null : err instanceof Error ? err.message : "Upload failed",
          xhr: null,
        });
      } finally {
        activeCountRef.current -= 1;
        pumpRef.current();
      }
    },
    [patchRow],
  );

  const pump = useCallback(() => {
    while (activeCountRef.current < MAX_CONCURRENT_UPLOADS && queueRef.current.length > 0) {
      const id = queueRef.current.shift()!;
      const row = rowsRef.current.get(id);
      if (!row || row.status === "canceled") continue;
      activeCountRef.current += 1;
      patchRow(id, { status: "queued" });
      void runPipeline(id);
    }
  }, [patchRow, runPipeline]);
  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  /** Starts the upload pipeline for every currently-ready row (matched, not a duplicate, not already in flight/done). Never called automatically — the caller must explicitly approve. */
  const startImport = useCallback((ids?: string[]) => {
    const targetIds =
      ids ??
      Array.from(rowsRef.current.values())
        .filter((r) => r.status === "matched" && r.match?.status === "matched" && !r.match.isDuplicate)
        .map((r) => r.id);
    queueRef.current.push(...targetIds);
    pump();
  }, [pump]);

  const retry = useCallback(
    (id: string) => {
      queueRef.current.push(id);
      pump();
    },
    [pump],
  );

  const cancel = useCallback(
    (id: string) => {
      const row = rowsRef.current.get(id);
      if (row?.xhr) {
        row.xhr.abort();
      } else {
        queueRef.current = queueRef.current.filter((qid) => qid !== id);
        patchRow(id, { status: "canceled" });
      }
    },
    [patchRow],
  );

  const rowList = useMemo(() => Array.from(rows.values()), [rows]);
  const matchSummary = useMemo(
    () => summarizeMatches(rowList.filter((r) => r.match).map((r) => r.match!)),
    [rowList],
  );

  return {
    rows: rowList,
    matchSummary,
    addFiles,
    removeRow,
    startImport,
    retry,
    cancel,
  };
}
