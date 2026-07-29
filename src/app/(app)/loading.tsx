import { PageContainer } from "@/components/nav/page-container";
import { CardGridSkeleton } from "@/components/states/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageContainer>
      <div className="mb-8 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-64" />
      </div>
      <CardGridSkeleton />
    </PageContainer>
  );
}
