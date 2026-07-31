import { ControlRoom } from "@/components/dashboard/control-room";
import { RealRecordingsSummary } from "@/components/dashboard/real-recordings-summary";
import { ProductivityWidgets } from "@/components/productivity/productivity-widgets";
import { PageContainer } from "@/components/nav/page-container";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <PageContainer>
      <RealRecordingsSummary />
      <ProductivityWidgets />
      <ControlRoom />
    </PageContainer>
  );
}
