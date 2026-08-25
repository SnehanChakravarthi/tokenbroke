import { BRAND } from "@tokenbroke/shared";
import type { ReactNode } from "react";
import type { PublicLeaderboardV1 } from "@/src/lib/leaderboard";
import type { MovementStats } from "@/src/lib/movement";

/**
 * The whole thesis as a pipeline: run → recorded → pressure → reset. One continuous
 * rail carries the flow — horizontal on desktop, a vertical timeline on mobile.
 */
export function TheLoop({
  stats,
  boards,
}: {
  stats: MovementStats;
  boards: PublicLeaderboardV1[];
}) {
  const medians = boards
    .map((board) => board.global.medianRemainingPercent)
    .filter((value): value is number => value !== null);
  const median = medians.length
    ? Math.round((medians.reduce((a, b) => a + b, 0) / medians.length) * 10) / 10
    : null;
  const lastResetFor = (tool: "codex" | "claude-code") =>
    stats.resets.find((reset) => reset.tool === tool) ?? null;
  const resetChip = (tool: "codex" | "claude-code", tone: string, name: string) => {
    const reset = lastResetFor(tool);
    if (!reset) return null;
    const days = Math.floor((Date.now() - Date.parse(reset.landedAt)) / 86_400_000);
    return (
      <p key={tool} className="text-[12px] text-dim">
        <span className="text-ok">✓</span> <span className={tone}>{name}</span>{" "}
        <span className="tabular-nums text-paper">{days === 0 ? "today" : `${days}d ago`}</span>
      </p>
    );
  };

  const steps: Array<{ label: string; body: ReactNode }> = [
    {
      label: "run it",
      body: (
        <>
          <p className="text-sm font-semibold text-paper">
            <span className="text-faint">$ </span>
            {BRAND.cliCommand}
          </p>
          <p className="mt-1 text-[11px] text-muted">5 seconds. anonymous.</p>
        </>
      ),
    },
    {
      label: "you're counted",
      body: (
        <p className="display text-2xl font-black tabular-nums text-paper">
          {stats.devsOnRecord.toLocaleString("en-US")}
          <span className="ml-2 align-middle text-[11px] font-normal uppercase tracking-[0.18em] text-muted">
            of us
          </span>
        </p>
      ),
    },
    {
      label: "the pain gets visible",
      body: (
        <>
          <p className="display text-2xl font-black tabular-nums text-broke">
            {median === null ? "—" : `${Math.round((100 - median) * 10) / 10}%`}
            <span className="ml-2 align-middle text-base" aria-hidden>
              🔥
            </span>
          </p>
          <p className="mt-1 text-[11px] text-muted">of our tokens, already burned</p>
        </>
      ),
    },
    {
      label: "resets happen",
      body: (
        <>
          <div className="space-y-1">
            {resetChip("codex", "text-codex", "codex")}
            {resetChip("claude-code", "text-claude", "claude")}
          </div>
          <p className="mt-1 text-[11px] text-muted">both labs have folded before.</p>
        </>
      ),
    },
  ];

  return (
    <div>
      <div className="relative mx-auto max-w-4xl">
        {/* Desktop rail: one continuous line running through all four step keys. */}
        <div
          aria-hidden
          className="rail-x absolute left-[12.5%] right-[12.5%] top-[15px] hidden lg:block"
        />
        <ol className="grid gap-8 lg:grid-cols-4 lg:gap-6">
          {steps.map((step, index) => (
            <li
              key={step.label}
              className="relative flex items-start gap-4 lg:flex-col lg:items-center lg:gap-3 lg:text-center"
            >
              {/* Mobile rail: segment from this step's key down to the next one. */}
              {index < steps.length - 1 && (
                <span
                  aria-hidden
                  className="rail-y absolute -bottom-8 left-[15px] top-8 lg:hidden"
                />
              )}
              <span className="keycap display relative z-10 grid size-8 shrink-0 place-items-center text-sm font-black text-paper">
                {index + 1}
              </span>
              <div className="min-w-0 pt-1 lg:pt-0">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted">{step.label}</p>
                <div className="mt-1.5">{step.body}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <p className="mt-8 text-center text-[11px] uppercase tracking-[0.24em] text-muted">
        bigger number{" "}
        <span aria-hidden className="text-faint">
          →
        </span>{" "}
        sooner resets. <span className="text-paper">that&apos;s the whole game.</span>
      </p>
    </div>
  );
}
