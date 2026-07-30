// Shared helpers for the Phase 2A RLS test suite. Plain Node + @supabase/supabase-js
// against the local stack started by `supabase start` — no test framework
// dependency, just enough assertion tooling to make failures readable.
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing Supabase env vars. Run with: node --env-file=.env.local supabase/tests/rls.test.mjs",
  );
  process.exit(1);
}

export const DEV_PASSWORD = "devpassword123";

export const serviceClient = createClient(URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Returns a client signed in as the given seed user (see supabase/seed.sql). */
export async function signInAs(email) {
  const client = createClient(URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (error) throw new Error(`Failed to sign in as ${email}: ${error.message}`);
  return client;
}

let passed = 0;
let failed = 0;
const failures = [];

export function check(description, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ok — ${description}`);
  } else {
    failed += 1;
    failures.push(description);
    console.log(`  FAIL — ${description}`);
  }
}

export function summarize() {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}
