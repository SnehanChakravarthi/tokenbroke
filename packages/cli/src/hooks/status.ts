import { constants } from "node:fs";
import { access } from "node:fs/promises";
import type { ToolId } from "@tokenbroke/shared";
import {
  type HookLocations,
  HookToolError,
  type HookToolFailure,
  hookLocations,
  isTokenbrokeHandler,
  locationFor,
  parseToolConfig,
  readToolConfig,
} from "./install";

export type HookState = "installed" | "trusted" | "missing" | "stale-node";

export interface HookStatusResult {
  /** Absent for a tool whose settings file could not be read; see `failures`. */
  states: Partial<Record<ToolId, HookState>>;
  failures: HookToolFailure[];
}

interface LocatedHandler {
  handler: Record<string, unknown>;
  group: Record<string, unknown>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findHandler(config: Record<string, unknown>): LocatedHandler | null {
  if (!isObject(config.hooks) || !Array.isArray(config.hooks.Stop)) return null;
  for (const group of config.hooks.Stop) {
    if (!isObject(group) || !Array.isArray(group.hooks)) continue;
    for (const handler of group.hooks) {
      if (isObject(handler) && isTokenbrokeHandler(handler)) return { handler, group };
    }
  }
  return null;
}

function nodePath(handler: Record<string, unknown>): string | null {
  if (typeof handler.command !== "string") return null;
  if (Array.isArray(handler.args)) return handler.command;
  const match = handler.command.match(/^"((?:\\.|[^"\\])*)"/);
  if (!match?.[1]) return handler.command.split(/\s+/)[0] ?? null;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return null;
  }
}

async function oneStatus(tool: ToolId, path: string): Promise<HookState> {
  const raw = await readToolConfig(tool, path);
  if (raw === null) return "missing";
  const config = parseToolConfig(tool, raw);
  const located = findHandler(config);
  if (!located) return "missing";
  const node = nodePath(located.handler);
  if (
    !node ||
    !(await access(node, constants.X_OK).then(
      () => true,
      () => false,
    ))
  )
    return "stale-node";
  if (tool === "claude-code") return "trusted";
  return located.handler.enabled === true ||
    located.handler.trusted === true ||
    located.group.enabled === true ||
    located.group.trusted === true ||
    config.trusted === true
    ? "trusted"
    : "installed";
}

export async function hookStatus(
  locations: HookLocations = hookLocations(),
): Promise<HookStatusResult> {
  const states: Partial<Record<ToolId, HookState>> = {};
  const failures: HookToolFailure[] = [];
  const tools: ToolId[] = ["claude-code", "codex"];
  const settled = await Promise.all(
    tools.map(async (tool) => {
      try {
        return { tool, state: await oneStatus(tool, locationFor(tool, locations)) };
      } catch (error) {
        if (!(error instanceof HookToolError)) throw error;
        return { tool, failure: { tool: error.tool, kind: error.kind } };
      }
    }),
  );
  for (const item of settled) {
    if ("state" in item) states[item.tool] = item.state;
    else failures.push(item.failure);
  }
  return { states, failures };
}
