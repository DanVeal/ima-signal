import Link from "next/link";
import { cn } from "@/lib/utils";

const WIDTH_CLASS = {
  content: "max-w-(--width-content)",
  wide: "max-w-(--width-wide)",
  reading: "max-w-(--width-reading)",
};

export function PageContainer({
  width = "content",
  className,
  children,
}: {
  width?: "content" | "wide" | "reading";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full px-4 py-10 sm:px-6 lg:px-10", WIDTH_CLASS[width], className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        {eyebrow && (
          <p className="mb-2 text-xs font-medium tracking-wide text-brand uppercase">{eyebrow}</p>
        )}
        <h1 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">{title}</h1>
        {description && (
          <p className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-text-secondary">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * A lighter-weight alternative to <Panel> for compositions that should
 * read as part of the page rather than as a boxed widget — a heading, an
 * optional link, a hairline rule, then content with no surrounding border.
 */
export function Section({
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
    <section className={cn(className)}>
      <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-border-subtle pb-3">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
        </div>
        {href && (
          <Link href={href as never} className="shrink-0 text-xs font-medium text-brand hover:underline">
            {hrefLabel}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
