import type { PlanInfo } from "@tokenbroke/shared";

const CLAUDE_PLAN_LABELS: Readonly<Record<string, string>> = {
  default_claude_max_5x: "Max 5x",
  default_claude_max_20x: "Max 20x",
};

// Pinned to openai/codex KnownPlan::display_name at c9b19de (RFC 001).
const CODEX_PLAN_LABELS: Readonly<Record<string, string>> = {
  free: "Free",
  go: "Go",
  plus: "Plus",
  pro: "Pro",
  prolite: "Pro Lite",
  team: "Team",
  self_serve_business_prolite: "Self Serve Business ProLite",
  self_serve_business_usage_based: "Self Serve Business Usage Based",
  business: "Business",
  ent26: "Enterprise",
  enterprise_cbp_automation: "Enterprise (Automation)",
  enterprise_cbp_usage_based: "Enterprise CBP Usage Based",
  enterprise: "Enterprise",
  edu: "Edu",
  edu_plus: "Edu Plus",
  edu_pro: "Edu Pro",
};

function plan(raw: string | null, labels: Readonly<Record<string, string>>): PlanInfo {
  return { raw, label: raw === null ? null : (labels[raw] ?? null) };
}

export function claudePlan(raw: string | null): PlanInfo {
  return plan(raw, CLAUDE_PLAN_LABELS);
}

export function codexPlan(raw: string | null): PlanInfo {
  return plan(raw, CODEX_PLAN_LABELS);
}
