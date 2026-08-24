import { BRAND } from "@tokenbroke/shared";
import { siteDatabase } from "@/src/lib/dev-db";
import { getPublicLeaderboard } from "@/src/lib/leaderboard";
import { movementStats } from "@/src/lib/movement";
import { Board } from "./components/board";
import { CopyCommand } from "./components/copy-command";
import { SEVERITY_LABEL, severityFor } from "./components/format";
import { MilestoneBar, TheLoop } from "./components/loop";
import { MovementCount } from "./components/movement";
import { DaysSince, PovertyMeter } from "./components/stat-blocks";
import { Ticker } from "./components/ticker";

export const dynamic = "force-dynamic";

export default async function Home() {
  const now = new Date();
  const database = await siteDatabase();
  const [codex, claude, movement] = await Promise.all([
    getPublicLeaderboard("codex", { now, database }),
    getPublicLeaderboard("claude-code", { now, database }),
    movementStats(database),
  ]);
  const boards = [codex, claude];
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
      <div className="px-2 pt-2 sm:px-3 sm:pt-3">
        <div
          className={`rounded-lg px-4 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.28em] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_6px_16px_-10px_rgba(0,0,0,0.9)] ${bannerTone}`}
        >
          token availability: {SEVERITY_LABEL[worst]}
        </div>
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
        {/* Hero: the condition, the ask, and the mechanism — drawn, not written. */}
        <section className="pt-12 sm:pt-16">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:items-end">
            <div>
              <h1 className="display max-w-3xl text-[clamp(2.4rem,10.5vw,4.5rem)] font-black leading-[0.95] tracking-tight text-paper sm:text-7xl">
                ARE YOU
                <br />
                <span className="text-broke">TOKENBROKE?</span>
              </h1>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-dim sm:text-base">
                Out of tokens with days on the clock? Nobody measures how rate-limited we are —
                <span className="text-paper"> so we do.</span> Get on the record:
              </p>
              <div className="mt-6">
                <CopyCommand command={BRAND.cliCommand} />
              </div>
              <ul className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.16em]">
                {[
                  "reads 2 numbers — never your code",
                  "anonymous · no signup",
                  "auto-updates: hooks install",
                ].map((chip) => (
                  <li key={chip} className="well px-2.5 py-1.5 text-muted">
                    {chip}
                  </li>
                ))}
              </ul>
            </div>
            <div className="lg:pb-1">
              <p className="mb-4 text-[11px] uppercase tracking-[0.22em] text-muted">
                the record, growing
              </p>
              <MovementCount stats={movement} />
              <div className="mt-7">
                <MilestoneBar stats={movement} />
              </div>
            </div>
          </div>
        </section>

        {/* The loop: why one row matters. */}
        <section className="mt-10" aria-label="How it works">
          <TheLoop stats={movement} boards={boards} />
        </section>

        {/* ACT IV — the instruments and the dessert. */}
        <section
          aria-label="Aggregate state"
          className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <DaysSince board={codex} />
          <DaysSince board={claude} />
          <PovertyMeter board={codex} />
          <PovertyMeter board={claude} />
        </section>

        <section className="mt-10 grid items-start gap-3 lg:grid-cols-2">
          <Board board={codex} now={now} />
          <Board board={claude} now={now} />
        </section>
      </main>

      <div className="mx-auto mt-12 w-full max-w-6xl px-4 sm:px-6">
        <Ticker boards={boards} />
      </div>

      <footer className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-3 text-[11px] leading-relaxed text-faint sm:flex-row sm:justify-between">
          <p className="max-w-md">
            {BRAND.name} is an unaffiliated parody and community tool. Not endorsed by, associated
            with, or speaking for OpenAI or Anthropic. The bit is affectionate — the endgame is the
            labs reading this page. The data is serious.
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
