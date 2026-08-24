import { BRAND } from "@tokenbroke/shared";
import { siteDatabase } from "@/src/lib/dev-db";
import { getPublicLeaderboard } from "@/src/lib/leaderboard";
import { movementStats } from "@/src/lib/movement";
import { Board } from "./components/board";
import { CopyCommand } from "./components/copy-command";
import { SEVERITY_LABEL, severityFor } from "./components/format";
import { Milestones, MovementCount, ResetLedger } from "./components/movement";
import { DaysSince, PovertyMeter } from "./components/stat-blocks";
import { Ticker } from "./components/ticker";
import { TrustSteps } from "./components/trust-steps";

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
        {/* ACT I — recognition. This is about your Tuesday. */}
        <section className="pt-14 sm:pt-20">
          <h1 className="display max-w-3xl text-[clamp(2.4rem,10.5vw,4.5rem)] font-black leading-[0.95] tracking-tight text-paper sm:text-7xl">
            ARE YOU
            <br />
            <span className="text-broke">TOKENBROKE?</span>
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-dim sm:text-base">
            You hit the limit mid-refactor. The countdown says four days. Your agent is asleep, your
            branch is open, and somewhere a dashboard you'll never see knows exactly how many of us
            are sitting here like this.
          </p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-paper sm:text-base">
            So we built the dashboard ourselves.
          </p>
        </section>

        {/* ACT II — the movement. One number, its trajectory, and proof the loop closes. */}
        <section className="mt-12 grid gap-10 lg:grid-cols-[1.2fr_1fr]" aria-label="The record">
          <div>
            <MovementCount stats={movement} />
            <div className="mt-8 max-w-xl space-y-3 text-[13px] leading-relaxed text-dim">
              <p>
                Nobody publishes how rate-limited we actually are — the labs see the graphs, we see{" "}
                <span className="text-paper">"come back Thursday."</span> So this is the public
                record: real usage, read from real machines, filed by the people living it.
              </p>
              <p>
                One dev out of tokens is a complaint.{" "}
                <span className="text-paper">
                  A thousand is a statistic. A hundred thousand is a negotiation.
                </span>{" "}
                Every row makes the number harder to ignore — and the number is the whole argument.
                Resets happen when the pressure gets legible.{" "}
                <span className="text-paper">We make it legible.</span>
              </p>
            </div>
            <div className="mt-8">
              <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-muted">
                proof it works
              </p>
              <ResetLedger stats={movement} />
            </div>
          </div>
          <div className="panel h-fit p-5">
            <p className="mb-4 text-[11px] uppercase tracking-[0.22em] text-muted">
              where this goes
            </p>
            <Milestones stats={movement} />
          </div>
        </section>

        {/* ACT III — the ask. One command, trust handled. */}
        <section className="panel mt-12 p-5 sm:p-7" aria-label="Join the record">
          <div className="grid gap-6 lg:grid-cols-[auto_1fr] lg:items-start">
            <div>
              <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-muted">
                add your row. this is the whole thing:
              </p>
              <CopyCommand command={BRAND.cliCommand} />
              <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-faint">
                ~5 seconds · anonymous · open source · claim your row later if vanity wins
              </p>
            </div>
            <TrustSteps />
          </div>
        </section>

        {/* ACT IV — the instruments and the dessert. */}
        <section
          aria-label="Aggregate state"
          className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
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
