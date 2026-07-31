"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo size="lg" />
      <div className="flex size-12 items-center justify-center rounded-full bg-important-100 text-important">
        <AlertTriangle className="size-6" strokeWidth={1.75} />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold text-ink-900">Something went wrong</h1>
        <p className="max-w-sm text-sm text-text-muted">
          This page hit an unexpected error. Try again, or head back to Home if it keeps happening.
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => (window.location.href = "/")}>
          Back to Home
        </Button>
        <Button onClick={() => reset()}>Try again</Button>
      </div>
    </div>
  );
}
