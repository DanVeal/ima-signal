import { PageContainer } from "@/components/nav/page-container";
import { ActivityPageContent } from "@/components/activity/activity-page-content";
import { createClient } from "@/lib/supabase/server";
import { getGlobalActivityFeed } from "@/lib/activity/queries";

// Requires a signed-in session (real Supabase Auth + RLS) — never prerendered at build time.
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const supabase = await createClient();
  const { events, filterOptions } = await getGlobalActivityFeed(supabase);
  return (
    <PageContainer>
      <ActivityPageContent events={events} filterOptions={filterOptions} />
    </PageContainer>
  );
}
