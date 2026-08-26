import { BRAND, claimUrl } from "@tokenbroke/shared";

// Every user-facing string the CLI prints that is not data. Deadpan infrastructure parody:
// Statuspage voice, human suffering. Funny in copy, dead serious in data. Never mean to the labs.
// Server-side roasts (per-rank) come in the API response; this file is the CLI's own voice.

export const COPY = {
  header: `${BRAND.name} · are you ${BRAND.name}? prove it.`,
  reading: "reading your local usage state…",
  submitting: "filing your offering with the record…",

  boardTitle: (toolLabel: string): string =>
    `${toolLabel.toUpperCase()} · MOST RATE-LIMITED DEVELOPERS ALIVE`,
  youMarker: "◀ you",
  anonymousBadge: "anon",
  asOf: (hoursAgo: number): string => `as of ${Math.round(hoursAgo)}h ago`,
  snapshotAge: (hoursAgo: number): string =>
    `read from your last session, ${hoursAgo}h ago. use the tool, then run me again.`,
  sentenceServed: "sentence served. run again to confirm you're still broke",
  notBroke: "not broke. come back when it hurts.",

  collective: (
    devs: number,
    medianRemaining: number | null,
    daysSinceReset: number | null,
  ): string => {
    const median = medianRemaining === null ? "median n/a" : `median ${medianRemaining}% remaining`;
    const days =
      daysSinceReset === null
        ? "no reset on record"
        : `${daysSinceReset} day${daysSinceReset === 1 ? "" : "s"} since last reset`;
    return `collectively: ${devs.toLocaleString("en-US")} devs, ${median}, ${days}.`;
  },

  claim: (code: string): string =>
    `claim this row (github, optional): ${claimUrl(code)}\nvanity is free. rank is earned.`,
  claimed: (login: string): string => `filed as @${login}.`,

  noTools: [
    `no Claude Code or Codex usage found on this machine.`,
    `you can't be ${BRAND.name} if you never had tokens. aspirational.`,
  ].join("\n"),
  oneToolMissing: (missingLabel: string): string =>
    `${missingLabel}: not installed. one fewer way to suffer.`,
  noSnapshot: (toolLabel: string): string =>
    `${toolLabel}: installed, but it hasn't talked to the API yet. run it, then run this.`,

  localFailure: "something broke locally before the board got involved. nothing was filed.",
  rejected: (reason: string): string =>
    `offering declined (${reason}). the board remains real without you.`,
  offline: "couldn't reach the board. your suffering was real; the network was not.",
  identityCorrupt: (): string =>
    [
      `~/${BRAND.configDirName}/identity.json is unreadable.`,
      `move it aside to start a new row, or restore it to keep the old one.`,
    ].join(" "),
  usage: (): string =>
    [
      `usage:`,
      `  ${BRAND.cliCommand}                        read, submit, print the board`,
      `  ${BRAND.cliCommand} hooks install|remove|status`,
      `  ${BRAND.cliCommand} hook <tool>            internal; what the hooks call`,
      `  ${BRAND.cliCommand} --json                 the response plus local readings`,
      `  ${BRAND.cliCommand} --dry-run              read and summarize, no network`,
      `  ${BRAND.cliCommand} --dry-run --full       same, with the complete redacted payload`,
      `  ${BRAND.cliCommand} --no-hooks-prompt      skip the first-run hooks offer`,
      `no other flags. that's the whole surface.`,
    ].join("\n"),

  claimLine: (url: string): string => `claim your row (github, ~30s): ${url}`,
  claimOffer: (url: string): string =>
    [
      "",
      "  ┌─────────────────────────────────────────────┐",
      "  │  one favor: claim your row?                 │",
      "  │                                             │",
      "  │  it's anonymous right now. a github login   │",
      "  │  (~30s) puts your name & avatar on the      │",
      "  │  public board, and honestly, the record    │",
      "  │  hits harder with real faces on it.         │",
      "  │  nothing else changes. we'd love to have    │",
      "  │  you on it properly.                        │",
      "  └─────────────────────────────────────────────┘",
      `  ${url}`,
      "  open in browser? [Y/n] ",
    ].join("\n"),
  claimOpening: "opening… sign in with github and you're on the board by name.",
  claimLater: "no worries. the link is on your receipt whenever vanity wins.",
  hooksOffer: (tools: string[]): string =>
    [
      `keep your row fresh automatically?`,
      `this adds one "Stop" hook for ${tools.join(" and ")} that runs ${BRAND.name} after a response,`,
      `at most once per 5 minutes, reading only usage/rate-limit state. nothing else.`,
      `remove anytime: ${BRAND.cliCommand} hooks remove`,
    ].join("\n"),
  hooksPrompt: "[y/N] ",
  hooksInstalled: (tools: string[]): string => `hooks installed for ${tools.join(", ")}.`,
  hooksCodexTrust: `codex requires you to trust new hooks: open codex and run /hooks.`,
  hooksRemoved: "hooks removed. you're on your own again.",
  hooksToolError: (tool: string, what: "malformed" | "unreadable" | "unwritable"): string =>
    `${tool}: its settings file is ${what}. fix that, then try again.`,
  hooksStatusLine: (
    tool: string,
    state: "installed" | "trusted" | "missing" | "stale-node",
  ): string => {
    const label = {
      installed: "installed, awaiting trust",
      trusted: "active",
      missing: "not installed",
      "stale-node": "installed, but node moved; run hooks install again",
    }[state];
    return `${tool}: ${label}`;
  },

  dryRun: "dry run. network skipped. nothing filed. this is what would have been sent:",
  dryRunPayload: (
    schemaVersion: string,
    cliVersion: string,
    trigger: string,
    bytes: number,
    fields: string[],
  ): string =>
    [
      `payload: schema v${schemaVersion} · cli ${cliVersion} · trigger ${trigger} · ${bytes.toLocaleString("en-US")} bytes`,
      `fields: ${fields.join(", ")}`,
      `identity: ephemeral (a real run keeps one in ~/${BRAND.configDirName})`,
      `full redacted payload: ${BRAND.cliCommand} --dry-run --full`,
    ].join("\n"),
  newVersion: (latest: string): string =>
    `newer ${BRAND.name} available (${latest}). the suffering is current; the tool is not.`,
} as const;

export const TOOL_LABELS = {
  "claude-code": "Claude Code",
  codex: "Codex",
} as const;
