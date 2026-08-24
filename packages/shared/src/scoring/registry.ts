import type { ToolId, UsageWindow } from "../readings";

export type WindowRole = "ranked" | "secondary" | "ignored";
export type DurationBand = "5h" | "7d" | null;

export interface WindowRule {
  tool: ToolId | "*";
  durationBand: DurationBand;
  scoped: boolean | null;
  limitId?: string;
  role: WindowRole;
  label: string;
  shortLabel: string;
}

export const REGISTRY_VERSION = 1 as const;

export const REGISTRY_V1: readonly WindowRule[] = [
  {
    tool: "claude-code",
    durationBand: "5h",
    scoped: false,
    role: "ranked",
    label: "5-hour",
    shortLabel: "5h",
  },
  {
    tool: "claude-code",
    durationBand: "7d",
    scoped: false,
    role: "ranked",
    label: "Weekly",
    shortLabel: "7d",
  },
  {
    tool: "claude-code",
    durationBand: "7d",
    scoped: true,
    role: "secondary",
    label: "Weekly · <scope>",
    shortLabel: "7d·<scope>",
  },
  {
    tool: "codex",
    durationBand: "5h",
    scoped: null,
    role: "ranked",
    label: "5-hour",
    shortLabel: "5h",
  },
  {
    tool: "codex",
    durationBand: "7d",
    scoped: null,
    role: "ranked",
    label: "Weekly",
    shortLabel: "7d",
  },
] as const;

export interface ClassifiedWindow {
  registryVersion: typeof REGISTRY_VERSION;
  role: WindowRole;
  label: string;
  shortLabel: string;
  registered: boolean;
  durationBand: DurationBand;
}

export function durationBandFor(windowMinutes: number | null): DurationBand {
  if (windowMinutes === null) return null;
  if (Math.abs(windowMinutes - 300) <= 15) return "5h";
  if (Math.abs(windowMinutes - 10_080) <= 60) return "7d";
  return null;
}

function ruleMatches(rule: WindowRule, window: UsageWindow, tool: ToolId): boolean {
  const scoped = window.scope !== null && window.scope.length > 0;
  return (
    (rule.tool === "*" || rule.tool === tool) &&
    rule.durationBand === durationBandFor(window.windowMinutes) &&
    (rule.scoped === null || rule.scoped === scoped) &&
    (rule.limitId === undefined || rule.limitId === window.limitId)
  );
}

function interpolate(value: string, scope: string | null): string {
  return value.replace("<scope>", scope ?? "raw");
}

export function classify(window: UsageWindow, tool: ToolId): ClassifiedWindow {
  const match = REGISTRY_V1.find((rule) => ruleMatches(rule, window, tool));
  if (!match) {
    return {
      registryVersion: REGISTRY_VERSION,
      role: "secondary",
      label: window.rawKind,
      shortLabel: window.rawKind,
      registered: false,
      durationBand: durationBandFor(window.windowMinutes),
    };
  }
  return {
    registryVersion: REGISTRY_VERSION,
    role: match.role,
    label: interpolate(match.label, window.scope),
    shortLabel: interpolate(match.shortLabel, window.scope),
    registered: true,
    durationBand: durationBandFor(window.windowMinutes),
  };
}

function fieldsOverlap<T>(left: T | "*", right: T | "*"): boolean {
  return left === "*" || right === "*" || left === right;
}

function rankedRulesOverlap(left: WindowRule, right: WindowRule): boolean {
  return (
    fieldsOverlap(left.tool, right.tool) &&
    left.durationBand === right.durationBand &&
    (left.scoped === null || right.scoped === null || left.scoped === right.scoped) &&
    (left.limitId === undefined || right.limitId === undefined || left.limitId === right.limitId)
  );
}

export function validateRegistry(rules: readonly WindowRule[] = REGISTRY_V1): void {
  const ranked = rules.filter((rule) => rule.role === "ranked");
  for (let i = 0; i < ranked.length; i++) {
    for (let j = i + 1; j < ranked.length; j++) {
      const left = ranked[i];
      const right = ranked[j];
      if (left && right && rankedRulesOverlap(left, right)) {
        throw new Error(`Overlapping ranked window rules at indexes ${i} and ${j}`);
      }
    }
  }
}

validateRegistry(REGISTRY_V1);
