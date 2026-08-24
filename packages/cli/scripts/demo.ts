// Dev-only: start the in-process stub server, run the built CLI against it once, shut down.
// Uses a throwaway TOKENBROKE_HOME so it never touches a real ~/.tokenbroke.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startStubServer } from "./stub-server";

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, "..", "dist", "index.js");
const stub = await startStubServer();
const home = await mkdtemp(join(tmpdir(), "tokenbroke-demo-"));

const child = spawn(process.execPath, [cli, "--no-hooks-prompt", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, TOKENBROKE_HOME: home, TOKENBROKE_API_URL: stub.url },
});
const exitCode: number = await new Promise((done) => child.on("exit", (code) => done(code ?? 1)));

await stub.close();
await rm(home, { recursive: true, force: true });
process.exit(exitCode);
