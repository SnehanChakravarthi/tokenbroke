export function resetsIn(resetsAt: string | null, now: Date): string {
  if (!resetsAt) return "—";
  const ms = Date.parse(resetsAt) - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "reset due";
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export function severityFor(medianRemaining: number | null): "ok" | "warn" | "broke" {
  if (medianRemaining === null) return "ok";
  if (medianRemaining <= 10) return "broke";
  if (medianRemaining <= 35) return "warn";
  return "ok";
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** 17_875_000 -> "17.9M": misery scores are big by construction. */
export function compactNumber(value: number): string {
  return compact.format(value);
}
