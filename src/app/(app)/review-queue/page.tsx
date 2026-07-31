import { PageContainer, PageHeader } from "@/components/nav/page-container";
import { RealReviewQueue } from "@/components/dashboard/real-review-queue";
import { createClient } from "@/lib/supabase/server";
import { getReviewQueue } from "@/lib/dashboard/queries";

// Requires a signed-in session (real Supabase Auth + RLS) — never prerendered at build time.
export const dynamic = "force-dynamic";

export default async function ReviewQueuePage() {
  const supabase = await createClient();
  const entries = await getReviewQueue(supabase);
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Review Queue"
        title="Review queue"
        description="Every recording currently waiting on a decision, ranked by urgency."
      />
      <RealReviewQueue entries={entries} />
    </PageContainer>
  );
}
