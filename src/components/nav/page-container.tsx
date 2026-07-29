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
    <div className={cn("mx-auto w-full px-4 py-8 sm:px-6 lg:px-10", WIDTH_CLASS[width], className)}>
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
    <div className={cn("mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        {eyebrow && (
          <p className="mb-1.5 text-xs font-medium tracking-wide text-brand uppercase">{eyebrow}</p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-text-secondary">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
