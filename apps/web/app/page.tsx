import { BRAND } from "@tokenbroke/shared";
import { siteDatabase } from "@/src/lib/dev-db";
import { getPublicLeaderboard } from "@/src/lib/leaderboard";
import { movementStats } from "@/src/lib/movement";
import { LabUniverse } from "./components/board";
import { CopyCommand } from "./components/copy-command";
import { SEVERITY_LABEL, severityFor } from "./components/format";
import { MilestoneBar, TheLoop } from "./components/loop";
import { MovementCount } from "./components/movement";
import { ThemeToggle } from "./components/theme-toggle";
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
      ? "text-broke bg-broke/10"
      : worst === "warn"
        ? "text-warn bg-warn/10"
        : "text-ok bg-ok/10";

  const glow =
    worst === "broke"
      ? "rgba(232, 67, 46, 0.10)"
      : worst === "warn"
        ? "rgba(212, 148, 20, 0.10)"
        : "rgba(24, 169, 87, 0.08)";

  return (
    <div className="min-h-screen" style={{ "--glow-color": glow } as React.CSSProperties}>
      <div className="px-2 pt-2 sm:px-3 sm:pt-3">
        <div
          className={`flex items-center justify-center gap-2 rounded-lg px-4 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.28em] ${bannerTone}`}
        >
          <span className="pip inline-block size-1.5 rounded-full bg-current" aria-hidden />
          token availability: {SEVERITY_LABEL[worst]}
        </div>
      </div>

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 pt-5 sm:px-6">
        <p className="display text-lg font-black tracking-tight text-paper">{BRAND.name}</p>
        <div className="flex items-center gap-4">
          <p className="hidden text-[10px] uppercase tracking-[0.18em] text-faint sm:block">
            unaffiliated parody · reads local usage data only
          </p>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Hero: one centered rally — the condition, the ask, nothing else. */}
        <section className="fade-up flex flex-col items-center pt-14 text-center sm:pt-20">
          <p className="mb-5 flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-muted">
            <span className="pip inline-block size-1.5 rounded-full bg-broke" aria-hidden />
            the public record of running dry
          </p>
          <h1 className="display max-w-3xl text-[clamp(2.6rem,11vw,5.5rem)] font-black leading-[0.95] tracking-tight text-paper [text-wrap:balance]">
            ARE YOU <span className="text-broke">TOKENBROKE?</span>
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-dim sm:text-base">
            Nobody measures how rate-limited we are.{" "}
            <span className="whitespace-nowrap text-paper">So we do.</span>
          </p>
          <div className="mt-8">
            <CopyCommand command={BRAND.cliCommand} />
          </div>
          <p className="mt-4 text-[10px] uppercase tracking-[0.16em] leading-relaxed text-muted">
            reads 2 numbers — never your code
            <span className="mx-2 text-faint">·</span>anonymous, no signup
            <span className="mx-2 text-faint">·</span>auto-updates:{" "}
            <span className="text-dim">hooks install</span>
          </p>
        </section>

        {/* The record: the number that only goes up, and where it's headed. */}
        <section
          className="fade-up fade-up-1 mx-auto mt-14 flex max-w-2xl flex-col items-center text-center"
          aria-label="The record"
        >
          <MovementCount stats={movement} />
          <div className="mt-7 w-full">
            <MilestoneBar stats={movement} />
          </div>
        </section>

        {/* The loop: why one row matters. */}
        <section className="fade-up fade-up-2 mt-14" aria-label="How it works">
          <TheLoop stats={movement} boards={boards} />
        </section>

        <section className="fade-up fade-up-3 mt-14 grid items-start gap-5 lg:grid-cols-2">
          <LabUniverse board={codex} now={now} />
          <LabUniverse board={claude} now={now} />
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
