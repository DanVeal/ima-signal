/**
 * The real IMA mark, supplied directly as SVG source. Rendered with
 * fill="currentColor" so it can sit in the ink-900 text colour used
 * throughout the UI rather than a hardcoded black — the artwork itself
 * is untouched.
 */
export function ImaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1215.09 285.46"
      className={className}
      fill="currentColor"
      role="img"
      aria-label="IMA"
    >
      <rect width="155.78" height="285.46" />
      <polygon points="443.67 145.69 389.45 0 175.36 0 175.36 285.46 320.13 285.46 320.13 104.66 393.12 285.46 493.85 285.46 566.85 105.58 566.85 285.46 711.62 285.46 711.62 0 497.52 0 443.67 145.69" />
      <path d="M1043,285.46h172.09L1083.37,0h-229.19l-131.72,285.46h172.09l15.67-42.41h117.11l15.67,42.41ZM937.19,170.05l31.59-85.53,31.59,85.53h-63.18Z" />
    </svg>
  );
}
