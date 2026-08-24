import { cp, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

export interface TestHome {
  home: string;
  cleanup: () => Promise<void>;
}

export async function createTestHome(): Promise<TestHome> {
  const home = await mkdtemp(join(tmpdir(), "tokenbroke-readers-"));
  return { home, cleanup: () => rm(home, { recursive: true, force: true }) };
}

export async function installClaudeFixture(home: string, name: string): Promise<void> {
  await cp(join(FIXTURES, "claude-code", name), join(home, ".claude.json"));
}

export async function installCodexFixture(
  home: string,
  name: string,
  relativeDirectory = "sessions/2026/08/22",
): Promise<string> {
  const destinationName = name.startsWith("rollout-") ? name : `rollout-${name}`;
  const destination = join(home, ".codex", relativeDirectory, destinationName);
  await mkdir(dirname(destination), { recursive: true });
  await cp(join(FIXTURES, "codex", name), destination);
  return destination;
}

export async function writeFixture(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

export async function readFixture(group: string, name: string): Promise<string> {
  return readFile(join(FIXTURES, group, name), "utf8");
}

export async function makeRecent(path: string, now: Date): Promise<void> {
  await utimes(path, now, now);
}
