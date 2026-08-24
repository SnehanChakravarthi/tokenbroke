import { homedir } from "node:os";
import { isAbsolute, join, normalize } from "node:path";
import type { InstallStatus } from "@tokenbroke/shared";
import type { FileSystemAccess } from "./access";

export interface ReaderEnvironment {
  CLAUDE_CONFIG_DIR?: string;
  CODEX_HOME?: string;
}

export interface PathCandidates {
  claudeConfigRoot: string;
  claudeStateFile: string;
  claudeOverride: boolean;
  claudeOverrideValid: boolean;
  codexHome: string;
  codexOverride: boolean;
  codexOverrideValid: boolean;
}

export interface ResolvedReaderPaths {
  claude: { install: InstallStatus; stateFile: string; unreadable: boolean };
  codex: { install: InstallStatus; home: string; unreadable: boolean };
}

export interface PathCandidateOptions {
  homeDir?: string;
  env?: ReaderEnvironment;
}

function overrideValue(value: string | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function createPathCandidates(options: PathCandidateOptions = {}): PathCandidates {
  const home = normalize(options.homeDir ?? homedir());
  const environment = options.env ?? process.env;
  const claudeOverride = overrideValue(environment.CLAUDE_CONFIG_DIR);
  const codexOverride = overrideValue(environment.CODEX_HOME);
  const claudeConfigRoot = normalize(claudeOverride ?? home);
  const codexHome = normalize(codexOverride ?? join(home, ".codex"));

  return {
    claudeConfigRoot,
    claudeStateFile: join(claudeConfigRoot, ".claude.json"),
    claudeOverride: claudeOverride !== null,
    claudeOverrideValid: claudeOverride === null || isAbsolute(claudeOverride),
    codexHome,
    codexOverride: codexOverride !== null,
    codexOverrideValid: codexOverride === null || isAbsolute(codexOverride),
  };
}

export async function resolveReaderPaths(
  candidates: PathCandidates,
  access: FileSystemAccess,
): Promise<ResolvedReaderPaths> {
  let claudeInstall: InstallStatus = "not-found";
  let claudeUnreadable = false;
  try {
    if (candidates.claudeOverride && !candidates.claudeOverrideValid) {
      claudeInstall = "invalid-override";
    } else if (
      candidates.claudeOverride &&
      (await access.pathKind(candidates.claudeConfigRoot)) !== "directory"
    ) {
      claudeInstall = "invalid-override";
    } else if ((await access.pathKind(candidates.claudeStateFile)) === "file") {
      claudeInstall = "found";
    }
  } catch {
    claudeInstall = candidates.claudeOverride ? "invalid-override" : "found";
    claudeUnreadable = true;
  }

  let codexInstall: InstallStatus = "not-found";
  let codexUnreadable = false;
  try {
    if (candidates.codexOverride && !candidates.codexOverrideValid) {
      codexInstall = "invalid-override";
    } else {
      const kind = await access.pathKind(candidates.codexHome);
      if (candidates.codexOverride && kind !== "directory") {
        codexInstall = "invalid-override";
      } else if (kind === "directory") {
        codexInstall = "found";
      }
    }
  } catch {
    codexInstall = candidates.codexOverride ? "invalid-override" : "found";
    codexUnreadable = true;
  }

  return {
    claude: {
      install: claudeInstall,
      stateFile: candidates.claudeStateFile,
      unreadable: claudeUnreadable,
    },
    codex: { install: codexInstall, home: candidates.codexHome, unreadable: codexUnreadable },
  };
}
