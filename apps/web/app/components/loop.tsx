import { BRAND } from "@tokenbroke/shared";
import type { PublicLeaderboardV1 } from "@/src/lib/leaderboard";
import type { MovementStats } from "@/src/lib/movement";

/** Animated flow connector: dashes drifting toward the next node. */
function Flow() {
  return (
    <svg
      viewBox="0 0 48 12"
      role="img"
      aria-label="flows into"
      className="mt-6 hidden h-3 w-10 shrink-0 self-start text-faint lg:block"
    >
      <path
        d="M2 6h38"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="4 5"
        className="flow-dash"
      />
      <path d="M40 2l6 4-6 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Node({
  step,
  label,
  children,
}: {
  step: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex-1">
      <p className="display text-3xl font-black leading-none text-line" aria-hidden>
        {step}
      </p>
      <p className="mt-1.5 text-[10px] uppercase tracking-[0.2em] text-muted">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/**
 * The whole thesis as a schematic: run → recorded → pressure → reset → repeat.
 * Replaces three paragraphs and the standalone reset ledger.
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
  return (
    <div className="relative">
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-3">
        <Node step="01" label="run it">
          <p className="text-sm font-semibold text-paper">
            <span className="text-faint">$ </span>
            {BRAND.cliCommand}
          </p>
          <p className="mt-1 text-[11px] text-muted">5 seconds. anonymous.</p>
        </Node>
        <Flow />
        <Node step="02" label="you're counted">
          <p className="display text-2xl font-black tabular-nums text-paper">
            {stats.devsOnRecord.toLocaleString("en-US")}
            <span className="ml-2 align-middle text-[11px] font-normal uppercase tracking-[0.18em] text-muted">
              on the record
            </span>
          </p>
          <p className="mt-1 text-[11px] text-muted">
            {stats.offeringsTotal.toLocaleString("en-US")} offerings and counting
          </p>
        </Node>
        <Flow />
        <Node step="03" label="pressure gets legible">
          <div className="well relative mt-1 h-3 overflow-hidden">
            {median !== null && (
              <div
                className="meter-cells absolute inset-y-[2px] left-[2px] rounded-[4px] text-warn"
                style={{ width: `${Math.max(2, Math.min(100, median))}%` }}
              />
            )}
            <div className="absolute inset-y-[-3px] left-[10%] w-px bg-broke" />
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            median <span className="text-warn">{median ?? "—"}%</span> left ·{" "}
            <span className="text-broke">poverty line</span> at 10
          </p>
        </Node>
        <Flow />
        <Node step="04" label="resets happen">
          <div className="space-y-1">
            {resetChip("codex", "text-codex", "codex")}
            {resetChip("claude-code", "text-claude", "claude")}
          </div>
          <p className="mt-1 text-[11px] text-muted">both labs have folded before.</p>
        </Node>
      </div>
      <p className="mt-4 text-center text-[11px] uppercase tracking-[0.24em] text-muted lg:text-right">
        <span aria-hidden className="mr-2 text-faint">
          ↩
        </span>
        every reset zeroes the counters — one of us is a complaint,{" "}
        <span className="text-paper">all of us is a negotiation</span>
      </p>
    </div>
  );
}

const MILESTONES = [
  { at: 100, label: "a support group" },
  { at: 1_000, label: "a statistic" },
  { at: 10_000, label: "a dataset" },
  { at: 50_000, label: "an open letter" },
  { at: 100_000, label: "we schedule the resets" },
];

/** The avalanche as one log-scale line. */
export function MilestoneBar({ stats }: { stats: MovementStats }) {
  const count = Math.max(1, stats.devsOnRecord);
  const max = Math.log10(100_000);
  const position = Math.min(100, (Math.log10(count) / max) * 100);
  const next = MILESTONES.find((milestone) => milestone.at > count);
  return (
    <div>
      <div className="well relative h-4 overflow-visible">
        <div
          className="absolute inset-y-[2px] left-[2px] rounded-[5px] bg-gradient-to-r from-line to-warn/80"
          style={{ width: `calc(${Math.max(position, 2)}% - 2px)` }}
        />
        {MILESTONES.map((milestone) => {
          const at = (Math.log10(milestone.at) / max) * 100;
          const reached = count >= milestone.at;
          return (
            <span
              key={milestone.at}
              className={`absolute top-[-3px] h-[22px] w-px ${reached ? "bg-ok" : "bg-faint/60"}`}
              style={{ left: `${at}%` }}
              title={`${milestone.at.toLocaleString("en-US")} — ${milestone.label}`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3 text-[11px] uppercase tracking-[0.16em]">
        <p className="text-muted">
          {next ? (
            <>
              <span className="pip mr-1.5 inline-block size-1.5 rounded-full bg-broke align-middle" />
              <span className="text-paper">
                {(next.at - count).toLocaleString("en-US")} to "{next.label}"
              </span>{" "}
              — you count
            </>
          ) : (
            <span className="text-ok">terminal milestone reached</span>
          )}
        </p>
        <p className="hidden text-faint sm:block">100k — {MILESTONES[4]?.label}</p>
      </div>
    </div>
  );
}
