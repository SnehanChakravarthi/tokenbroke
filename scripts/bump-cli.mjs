// npm's version/pkg commands choke on bun's workspace:* protocol anywhere in this
// monorepo, so the release bump is a plain JSON edit.
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../packages/cli/package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(path, "utf8"));
const kind = process.argv[2] ?? "patch";
const [major, minor, patch] = pkg.version.split(".").map(Number);
pkg.version =
  kind === "major"
    ? `${major + 1}.0.0`
    : kind === "minor"
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`;
writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`v${pkg.version}`);
