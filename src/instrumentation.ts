/**
 * Starts the AI background worker once when the Next.js server boots —
 * this IS "move AI work off request threads" for a stack with no external
 * queue service (see src/lib/ai/worker.ts's header comment). Next.js
 * calls `register()` once per server instance; the module-level guard
 * additionally protects against dev-mode hot-reload re-invoking it.
 */
declare global {
  var __aiWorkerStop: (() => void) | undefined;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (globalThis.__aiWorkerStop) return;

  const { startWorkerPolling } = await import("@/lib/ai/worker");
  globalThis.__aiWorkerStop = startWorkerPolling();
}
