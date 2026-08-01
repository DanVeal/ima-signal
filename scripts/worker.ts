/**
 * Standalone entrypoint for the AI background worker (RC1) — runs
 * src/lib/ai/worker.ts's existing polling loop as its own long-lived
 * process, deployed separately from the Next.js app (Vercel) on a host
 * that keeps a Node process running continuously (Railway). This changes
 * nothing about the worker itself: it's the same processQueuedJobs/
 * startWorkerPolling code src/instrumentation.ts already calls for local
 * dev — see that file's header comment for why a persistent process is
 * required at all (in-process polling over a Postgres-backed queue, no
 * external queue service in this stack).
 *
 * Run with: tsx scripts/worker.ts (see package.json's "worker" script).
 * Needs the same env vars as the Next.js app's server-side code:
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ELEVENLABS_API_KEY.
 */
import { startWorkerPolling } from "@/lib/ai/worker";

const stop = startWorkerPolling();

console.log("[ai-worker] started, polling for queued AI jobs.");

function shutdown() {
  console.log("[ai-worker] shutting down.");
  stop();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
