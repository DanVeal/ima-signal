import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { RealRecordingsSummary } from "@/components/dashboard/real-recordings-summary";
import { PageContainer } from "@/components/nav/page-container";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <>
      <PageContainer className="pb-0">
        <RealRecordingsSummary />
      </PageContainer>
      <DashboardContent />
    </>
  );
}
