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
      <p className="mt-5 text-center text-[11px] uppercase tracking-[0.24em] leading-relaxed text-muted">
        bigger number → sooner resets. we're counting until{" "}
        <a
          href="https://x.com/thsottiaux"
          className="text-codex underline decoration-dotted underline-offset-2"
        >
          @thsottiaux
        </a>{" "}
        and{" "}
        <a
          href="https://x.com/bcherny"
          className="text-claude underline decoration-dotted underline-offset-2"
        >
          @bcherny
        </a>{" "}
        have to play their hand. <span className="text-faint">(affectionately)</span>
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

/** The avalanche as one log-scale line. */
export function MilestoneBar({ stats }: { stats: MovementStats }) {
  const count = Math.max(1, stats.devsOnRecord);
  const max = Math.log10(100_000);
  const position = Math.min(100, (Math.log10(count) / max) * 100);
  const next = MILESTONES.find((milestone) => milestone.at > count);
  return (
    <div>
      <div className="well relative mt-8 h-5 overflow-visible">
        <div
          className="absolute inset-y-[3px] left-[3px] rounded-full bg-gradient-to-r from-faint/40 to-broke/85"
          style={{ width: `calc(${Math.max(position, 2)}% - 3px)` }}
        />
        {/* you are here */}
        <span
          className="pip absolute top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-panel bg-broke shadow-[0_1px_4px_rgba(16,24,40,0.35)]"
          style={{ left: `calc(${Math.max(position, 2)}% - 6px)` }}
          aria-hidden
        />
        {MILESTONES.map((milestone) => {
          const at = (Math.log10(milestone.at) / max) * 100;
          const reached = count >= milestone.at;
          return (
            <span
              key={milestone.at}
              className={`absolute -top-7 -translate-x-1/2 text-base ${
                reached ? "" : "opacity-45 grayscale"
              }`}
              style={{ left: `${at}%` }}
              title={`${milestone.at.toLocaleString("en-US")} — ${milestone.label}`}
              aria-label={`${milestone.at.toLocaleString("en-US")}: ${milestone.label}${reached ? " (reached)" : ""}`}
              role="img"
            >
              {milestone.emoji}
            </span>
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
