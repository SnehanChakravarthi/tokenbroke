import { BRAND } from "@tokenbroke/shared";
import { siteDatabase } from "@/src/lib/dev-db";
import { getPublicLeaderboard } from "@/src/lib/leaderboard";
import { Board } from "./components/board";
import { CopyCommand } from "./components/copy-command";
import { SEVERITY_LABEL, severityFor } from "./components/format";
import { DaysSince, PovertyMeter } from "./components/stat-blocks";
import { Ticker } from "./components/ticker";

export const dynamic = "force-dynamic";

export default async function Home() {
  const now = new Date();
  const database = await siteDatabase();
  const [codex, claude] = await Promise.all([
    getPublicLeaderboard("codex", { now, database }),
    getPublicLeaderboard("claude-code", { now, database }),
  ]);
  const boards = [codex, claude];
  const totalDevs = codex.global.devs + claude.global.devs;
  const worst = boards
    .map((board) => severityFor(board.global.medianRemainingPercent))
    .reduce((left, right) =>
      left === "broke" || right === "broke"
        ? "broke"
        : left === "warn" || right === "warn"
          ? "warn"
          : "ok",
    );
  const bannerTone =
    worst === "broke"
      ? "bg-broke text-ink"
      : worst === "warn"
        ? "bg-warn text-ink"
        : "bg-ok/90 text-ink";

  return (
    <div className="min-h-screen">
      {/* Severity banner: the whole site is a status page; this is its status. */}
      <div
        className={`px-4 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.28em] ${bannerTone}`}
      >
        token availability: {SEVERITY_LABEL[worst]}
      </div>

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 pt-5 sm:px-6">
        <p className="display text-lg font-black tracking-tight text-paper">
          {BRAND.name}
          <span className="text-broke">_</span>
        </p>
        <p className="hidden text-[10px] uppercase tracking-[0.18em] text-faint sm:block">
          unaffiliated parody · reads local usage data only
        </p>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Hero */}
        <section className="py-14 sm:py-20">
          <p className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-muted">
            <span className="pip inline-block size-1.5 rounded-full bg-broke" aria-hidden />
            live telemetry · {totalDevs} instrumented devs
          </p>
          <h1 className="display max-w-3xl text-[clamp(2.4rem,10.5vw,4.5rem)] font-black leading-[0.95] tracking-tight text-paper sm:text-7xl">
            ARE YOU
            <br />
            <span className="text-broke">TOKENBROKE?</span>
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-dim sm:text-base">
            The public leaderboard of the most rate-limited AI-coding-tool users alive. One command
            reads your real local Codex / Claude Code usage and files you where you belong. No
            signup. No screenshots. No mercy.
          </p>
          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <CopyCommand command={BRAND.cliCommand} />
            <p className="text-[11px] uppercase tracking-[0.18em] text-faint">
              ~5 seconds · anonymous · prove it
            </p>
          </div>
        </section>

        {/* Instruments */}
        <section aria-label="Aggregate state" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DaysSince board={codex} />
          <DaysSince board={claude} />
          <PovertyMeter board={codex} />
          <PovertyMeter board={claude} />
        </section>

        {/* The boards */}
        <section className="mt-10 grid items-start gap-3 lg:grid-cols-2">
          <Board board={codex} now={now} />
          <Board board={claude} now={now} />
        </section>
      </main>

      <div className="mt-12">
        <Ticker boards={boards} />
      </div>

      <footer className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-3 text-[11px] leading-relaxed text-faint sm:flex-row sm:justify-between">
          <p className="max-w-md">
            {BRAND.name} is an unaffiliated parody and community tool. Not endorsed by, associated
            with, or speaking for OpenAI or Anthropic. The bit is affectionate. The data is serious.
          </p>
          <p className="max-w-md sm:text-right">
            The CLI reads usage and rate-limit state from your machine, on your machine, and submits
            only when you run it. Never prompts, never code, never conversations.
          </p>
        </div>
      </footer>
    </div>
  );
}
