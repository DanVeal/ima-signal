const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatTimecode(ms: number): string {
  const totalSeconds = ms / 1000;
  return formatDuration(totalSeconds);
}

export interface DeadlineStatus {
  label: string;
  tone: "overdue" | "due-soon" | "on-track";
}

export function getDeadlineStatus(iso: string, referenceDate: Date = new Date()): DeadlineStatus {
  const deadline = new Date(`${iso}T23:59:59Z`);
  const diffMs = deadline.getTime() - referenceDate.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return {
      label: `Overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}`,
      tone: "overdue",
    };
  }
  if (diffDays === 0) {
    return { label: "Due today", tone: "due-soon" };
  }
  if (diffDays <= 5) {
    return { label: `Due in ${diffDays} day${diffDays === 1 ? "" : "s"}`, tone: "due-soon" };
  }
  return { label: `Due ${formatDate(iso)}`, tone: "on-track" };
}

export function initialsFromName(name: string): string {
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
