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

/** How long ago a stale row was last observed: hours under two days, whole days after. */
export function lastSeen(observedAt: string, now: Date): string {
  const hours = Math.max(1, Math.round((now.getTime() - Date.parse(observedAt)) / 3_600_000));
  if (!Number.isFinite(hours)) return "a while ago";
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function severityFor(medianRemaining: number | null): "ok" | "warn" | "broke" {
  if (medianRemaining === null) return "ok";
  if (medianRemaining <= 10) return "broke";
  if (medianRemaining <= 35) return "warn";
  return "ok";
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** Adaptive misery display (RFC 006): 0, <0.1, one decimal to 10, integers above. */
export function compactNumber(value: number): string {
  if (value === 0) return "0";
  if (value < 0.1) return "<0.1";
  if (value < 10) return value.toFixed(1);
  return compact.format(Math.round(value));
}
