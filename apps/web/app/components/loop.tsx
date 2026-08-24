import { BRAND } from "@tokenbroke/shared";
import type { PublicLeaderboardV1 } from "@/src/lib/leaderboard";
import type { MovementStats } from "@/src/lib/movement";
import { CopyCommand } from "./copy-command";

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
      <p className="display text-3xl font-black leading-none text-faint/70" aria-hidden>
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
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1.5fr_auto_1fr_auto_1.2fr_auto_1.2fr] lg:items-start lg:gap-3">
        <Node step="01" label="run it">
          <CopyCommand command={BRAND.cliCommand} />
          <p className="mt-2.5 text-[10px] uppercase tracking-[0.14em] leading-relaxed text-muted">
            reads 2 numbers — never your code · anonymous
            <br />
            auto-updates: <span className="text-dim">hooks install</span>
          </p>
        </Node>
        <Flow />
        <Node step="02" label="you're counted">
          <p className="display text-2xl font-black tabular-nums text-paper">
            {stats.devsOnRecord.toLocaleString("en-US")}
            <span className="ml-2 align-middle text-[11px] font-normal uppercase tracking-[0.18em] text-muted">
              of us
            </span>
          </p>
        </Node>
        <Flow />
        <Node step="03" label="the pain gets visible">
          <p className="display text-2xl font-black tabular-nums text-broke">
            {median === null ? "—" : `${Math.round((100 - median) * 10) / 10}%`}
            <span className="ml-2 align-middle text-base" aria-hidden>
              🔥
            </span>
          </p>
          <p className="mt-1 text-[11px] text-muted">of our tokens — already burned</p>
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
      <p className="mt-5 text-center text-[11px] uppercase tracking-[0.24em] text-muted">
        bigger number{" "}
        <span aria-hidden className="text-faint">
          →
        </span>{" "}
        sooner resets. <span className="text-paper">that&apos;s the whole game.</span>
      </p>
    </div>
  );
}

const MILESTONES = [
  { at: 100, label: "a support group", emoji: "🤝" },
  { at: 1_000, label: "a statistic", emoji: "📊" },
  { at: 10_000, label: "a headline", emoji: "📣" },
  { at: 50_000, label: "an open letter", emoji: "✍️" },
  { at: 100_000, label: "we schedule the resets", emoji: "🗓️" },
];

/**
 * The avalanche as a crescendo: each milestone node is physically bigger than
 * the last — small now, a force later. Passed nodes fill; the next one pulses.
 */
export function MilestoneBar({ stats }: { stats: MovementStats }) {
  const count = Math.max(1, stats.devsOnRecord);
  const nextIndex = MILESTONES.findIndex((milestone) => milestone.at > count);
  const next = nextIndex === -1 ? null : MILESTONES[nextIndex];
  const SIZES = [22, 30, 40, 52, 66];
  const HEIGHTS = [3, 5, 7, 10];

  // Fraction of the current gap already crossed, log-scaled.
  const segmentFill = (index: number): number => {
    const from = index === 0 ? 1 : (MILESTONES[index]?.at ?? 1);
    const to = MILESTONES[index + 1]?.at ?? 100_000;
    if (count >= to) return 1;
    if (count <= from) return 0;
    return (Math.log10(count) - Math.log10(from)) / (Math.log10(to) - Math.log10(from));
  };

  return (
    <div>
      <div className="flex items-center justify-center">
        {MILESTONES.map((milestone, index) => {
          const size = SIZES[index] ?? 24;
          const reached = count >= milestone.at;
          const isNext = index === nextIndex;
          return (
            <span key={milestone.at} className="flex items-center">
              {index > 0 && (
                <span
                  className="relative w-6 overflow-hidden rounded-full bg-line sm:w-10"
                  style={{ height: HEIGHTS[index - 1] ?? 4 }}
                  aria-hidden
                >
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-broke"
                    style={{ width: `${segmentFill(index - 1) * 100}%` }}
                  />
                </span>
              )}
              <span className="flex flex-col items-center gap-1.5">
                <span
                  role="img"
                  aria-label={`${milestone.at.toLocaleString("en-US")}: ${milestone.label}${reached ? " (reached)" : ""}`}
                  title={`${milestone.at.toLocaleString("en-US")} — ${milestone.label}`}
                  className={`grid place-items-center rounded-full transition-transform ${
                    reached
                      ? "bg-broke text-ink shadow-[0_0_18px_rgba(255,98,87,0.45)]"
                      : isNext
                        ? "pip border-2 border-broke bg-broke/15 text-paper"
                        : "border border-line bg-panel-2/60 text-dim"
                  }`}
                  style={{ width: size, height: size, fontSize: size * 0.42 }}
                >
                  {milestone.emoji}
                </span>
                <span
                  className={`text-[9px] uppercase tracking-[0.12em] tabular-nums ${
                    reached ? "text-broke" : isNext ? "text-paper" : "text-faint"
                  }`}
                >
                  {milestone.at >= 1000 ? `${milestone.at / 1000}k` : milestone.at}
                </span>
              </span>
            </span>
          );
        })}
      </div>
      <p className="mt-3 text-center text-[11px] uppercase tracking-[0.16em] text-muted">
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
    </div>
  );
}
