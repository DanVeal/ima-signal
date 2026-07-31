"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col items-center justify-center gap-6 bg-surface px-6 text-center text-text-primary">
        <div className="flex size-12 items-center justify-center rounded-full bg-important-100 text-important">
          <AlertTriangle className="size-6" strokeWidth={1.75} />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold text-text-primary">IMA Signal hit an unexpected error</h1>
          <p className="max-w-sm text-sm text-text-muted">Reloading usually fixes this.</p>
        </div>
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex h-9 items-center rounded-md bg-brand px-4 text-sm font-medium text-white"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
