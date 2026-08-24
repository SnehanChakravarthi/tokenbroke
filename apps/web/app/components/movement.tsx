import type { MovementStats } from "@/src/lib/movement";

function Digits({ value, tone = "text-paper" }: { value: number; tone?: string }) {
  const text = value.toLocaleString("en-US");
  return (
    <span className="inline-flex gap-[3px]" role="img" aria-label={`${text} developers`}>
      {text.split("").map((char, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: static digit strip
          key={index}
          className={`display inline-block px-0.5 text-center text-5xl font-black tabular-nums sm:text-7xl ${
            char === "," ? "text-faint" : `keycap min-w-[0.72em] ${tone}`
          }`}
        >
          {char}
        </span>
      ))}
    </span>
  );
}

/** The snowball itself: the one number that only goes up. */
export function MovementCount({ stats }: { stats: MovementStats }) {
  return (
    <div>
      <Digits value={stats.devsOnRecord} />
      <p className="mt-3 text-[11px] uppercase tracking-[0.24em] text-muted">
        developers on the record ·{" "}
        <span className="text-paper">{stats.offeringsTotal.toLocaleString("en-US")}</span> offerings
        filed
      </p>
    </div>
  );
}

const MILESTONES: Array<{ at: number; label: string }> = [
  { at: 100, label: "a support group" },
  { at: 1_000, label: "a statistic" },
  { at: 10_000, label: "a dataset no PM can ignore" },
  { at: 50_000, label: "an open letter, signed by usage data" },
  { at: 100_000, label: "we don't ask for resets. we schedule them." },
];

/** The avalanche, given a shape: what the count unlocks as it grows. */
export function Milestones({ stats }: { stats: MovementStats }) {
  const count = stats.devsOnRecord;
  return (
    <ol className="relative flex flex-col gap-0">
      {MILESTONES.map((milestone, index) => {
        const reached = count >= milestone.at;
        const current = !reached && (index === 0 || count >= (MILESTONES[index - 1]?.at ?? 0));
        return (
          <li key={milestone.at} className="relative flex gap-4 pb-5 last:pb-0">
            {index < MILESTONES.length - 1 && (
              <span
                aria-hidden
                className={`absolute left-[7px] top-5 h-full w-px ${reached ? "bg-ok/50" : "bg-line"}`}
              />
            )}
            <span
              aria-hidden
              className={`relative mt-1 grid size-[15px] shrink-0 place-items-center rounded-full border text-[8px] font-bold ${
                reached
                  ? "border-ok/60 bg-ok/20 text-ok"
                  : current
                    ? "pip border-broke bg-broke/20 text-broke"
                    : "border-line bg-panel-2 text-faint"
              }`}
            >
              {reached ? "✓" : ""}
            </span>
            <div className="min-w-0">
              <p
                className={`text-sm tabular-nums ${
                  reached ? "text-ok" : current ? "text-paper" : "text-faint"
                }`}
              >
                <span className="font-bold">{milestone.at.toLocaleString("en-US")}</span>
                <span className="mx-2 text-faint">—</span>
                {milestone.label}
              </p>
              {current && (
                <p className="mt-0.5 text-[11px] uppercase tracking-[0.16em] text-muted">
                  {Math.max(0, milestone.at - count).toLocaleString("en-US")} to go. you count.
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const TOOL_NAME = { codex: "CODEX", "claude-code": "CLAUDE CODE" } as const;
const TOOL_TONE = { codex: "text-codex", "claude-code": "text-claude" } as const;

/** Proof the loop closes: resets happen, and each one is banked here forever. */
export function ResetLedger({ stats }: { stats: MovementStats }) {
  return (
    <div className="flex flex-col gap-3">
      {stats.resets.map((reset, index) => (
        <div key={reset.landedAt} className="well px-4 py-3">
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="display text-sm font-extrabold tracking-[0.18em] text-ok">
              RESET №{stats.resets.length - index} ACHIEVED
            </span>
            <span className={`text-[11px] uppercase tracking-[0.16em] ${TOOL_TONE[reset.tool]}`}>
              {TOOL_NAME[reset.tool]}
            </span>
            <span className="text-[11px] uppercase tracking-[0.16em] text-muted">
              {new Date(reset.landedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </p>
          <p className="mt-1 text-[12px] text-dim">
            {reset.offeringsThatCycle.toLocaleString("en-US")} offerings were filed that cycle.
            Sentences commuted. The counter went back to zero — because it can.
          </p>
        </div>
      ))}
      <div className="well px-4 py-3">
        <p className="display text-sm font-extrabold tracking-[0.18em] text-broke">
          CLAUDE CODE: NO RESET ON RECORD
        </p>
        <p className="mt-1 text-[12px] text-dim">
          No culture of amnesty. Yet. That's not a policy — it's a number nobody has made loud
          enough. See above for how this ends.
        </p>
      </div>
    </div>
  );
}
