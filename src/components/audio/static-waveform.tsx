/**
 * A non-interactive waveform preview — no playback context, no seeking.
 * Used anywhere a recording needs to "feel alive" at a glance (browse
 * rows, dashboard, latest recordings) without a full player attached.
 * Real peak data only; if a recording has none (still processing, or
 * legacy), renders a flat baseline rather than fabricating a shape.
 */
export function StaticWaveform({
  peaks,
  className,
  barClassName,
}: {
  peaks: number[] | null | undefined;
  className?: string;
  barClassName?: string;
}) {
  const bars = peaks && peaks.length > 0 ? peaks : new Array(48).fill(0.04);

  return (
    <div className={`flex h-8 items-center gap-px ${className ?? ""}`} aria-hidden="true">
      {bars.map((height, i) => (
        <span
          key={i}
          className={`min-w-px flex-1 rounded-full bg-ink-200 ${barClassName ?? ""}`}
          style={{ height: `${Math.max(height * 100, 4)}%` }}
        />
      ))}
    </div>
  );
}
