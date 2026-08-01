import { AppShell } from "@/components/nav/app-shell";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/repository";

// Requires a signed-in session (real Supabase Auth) — never prerendered at build time.
export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);

  return <AppShell profile={profile}>{children}</AppShell>;
}
