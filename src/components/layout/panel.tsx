import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  description,
  href,
  hrefLabel = "View all",
  className,
  children,
}: {
  title: string;
  description?: string;
  href?: string;
  hrefLabel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-surface-raised", className)}>
      <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
        </div>
        {href && (
          <Link
            href={href as never}
            className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-brand hover:underline"
          >
            {hrefLabel}
            <ChevronRight className="size-3.5" />
          </Link>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
