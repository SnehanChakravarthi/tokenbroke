import type { ToolId } from "@tokenbroke/shared";
import {
  atomicWriteText,
  fileMode,
  loadConfig,
  removeDirectoryIfEmpty,
  removeFileIfPresent,
  saveConfig,
  type TokenbrokePaths,
  tokenbrokePaths,
} from "../identity";
import {
  type HookLocations,
  HookToolError,
  type HookToolFailure,
  hookLocations,
  isTokenbrokeHandler,
  locationFor,
  parseToolConfig,
  readToolConfig,
  serializeConfig,
} from "./install";

type JsonObject = Record<string, unknown>;

export interface HookRemoveResult {
  removed: ToolId[];
  failures: HookToolFailure[];
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Strip every entry carrying our marker. Returns whether anything was actually removed. */
function removeHandlers(config: JsonObject): boolean {
  if (!isObject(config.hooks) || !Array.isArray(config.hooks.Stop)) return false;
  let removed = false;
  config.hooks.Stop = config.hooks.Stop.map((group) => {
    if (!isObject(group) || !Array.isArray(group.hooks)) return group;
    const hooks = group.hooks.filter(
      (handler) => !isObject(handler) || !isTokenbrokeHandler(handler),
    );
    if (hooks.length !== group.hooks.length) removed = true;
    return { ...group, hooks };
  }).filter((group) => !isObject(group) || !Array.isArray(group.hooks) || group.hooks.length > 0);
  return removed;
}

async function removeOne(tool: ToolId, path: string, paths: TokenbrokePaths): Promise<void> {
  const current = await readToolConfig(tool, path);
  if (current !== null) {
    // Locate our entry by its marker. We never kept a copy of the user's file to restore from.
    const parsed = parseToolConfig(tool, current);
    // Rewrite only when one of ours came out: a file we never touched keeps its own bytes.
    if (removeHandlers(parsed)) {
      try {
        await atomicWriteText(path, serializeConfig(parsed, current), {
          mode: (await fileMode(path)) ?? 0o600,
          expected: current,
        });
      } catch (error) {
        throw new HookToolError(tool, "unwritable", error);
      }
    }
  }
  const config = await loadConfig(paths);
  if (config.hookInstalls?.[tool]) {
    delete config.hookInstalls[tool];
    await saveConfig(config, paths);
  }
}

export async function removeHooks(
  options: { tools?: ToolId[]; paths?: TokenbrokePaths; locations?: HookLocations } = {},
): Promise<HookRemoveResult> {
  const tools = options.tools ?? ["claude-code", "codex"];
  const paths = options.paths ?? tokenbrokePaths();
  const locations = options.locations ?? hookLocations();
  const removed: ToolId[] = [];
  const failures: HookToolFailure[] = [];
  for (const tool of tools) {
    try {
      await removeOne(tool, locationFor(tool, locations), paths);
      removed.push(tool);
    } catch (error) {
      if (!(error instanceof HookToolError)) throw error;
      failures.push({ tool: error.tool, kind: error.kind });
    }
  }
  // The bundled CLI only exists to serve hooks; tear it down even if one tool refused to cooperate.
  await removeFileIfPresent(paths.bundledCli);
  await removeDirectoryIfEmpty(paths.binDir);
  return { removed, failures };
}
