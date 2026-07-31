import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface px-6 text-center">
      <Logo size="lg" />
      <div className="flex size-12 items-center justify-center rounded-full bg-ink-100 text-ink-500">
        <Compass className="size-6" strokeWidth={1.75} />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold text-text-primary">We couldn&apos;t find that page</h1>
        <p className="max-w-sm text-sm text-text-muted">
          The project, script or recording you&apos;re looking for may have moved, or you may not
          have access to it.
        </p>
      </div>
      <Button render={<Link href="/" />}>Back to Home</Button>
    </div>
  );
}
