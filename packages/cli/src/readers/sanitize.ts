// Local state files are attacker-influenced input: a lab tool can be pointed at a hostile org, and
// `~/.claude.json` mixes PII into the same object we read. Every string that survives into a
// `ToolReading` must therefore be shape-checked, not just type-checked, so nothing unbounded (an
// email, a pasted script tag, a 4 KB label) can ride a rate-limit field into a submission.

const TOKEN_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const LABEL_PATTERN = /^[A-Za-z0-9_.:-]+( [A-Za-z0-9_.:-]+)*$/;

/** Identifier-shaped values (`limit_id`, `plan_type`, `kind`, `group`, `severity`, plan tiers). */
export function safeToken(value: unknown, maxLength = 64): string | null {
  if (typeof value !== "string" || value.length > maxLength) return null;
  return TOKEN_PATTERN.test(value) ? value : null;
}

/** Human-facing labels (model display names): tokens joined by single spaces, nothing else. */
export function safeLabel(value: unknown, maxLength = 40): string | null {
  if (typeof value !== "string" || value.length > maxLength) return null;
  return LABEL_PATTERN.test(value) ? value : null;
}
