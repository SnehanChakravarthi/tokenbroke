import type { PublicLeaderboardV1 } from "@/src/lib/leaderboard";
import { severityFor } from "./format";

const TOOL_SHORT = { codex: "CODEX", "claude-code": "CLAUDE CODE" } as const;
const TOOL_TEXT = { codex: "text-codex", "claude-code": "text-claude" } as const;

function CounterDigits({ value }: { value: string }) {
  return (
    <span className="inline-flex gap-[3px]" aria-hidden>
      {value.split("").map((digit, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: static digit strip
          key={index}
          className="keycap display inline-block min-w-[1.35em] px-1 py-1 text-center text-3xl font-black tabular-nums text-paper sm:text-4xl"
        >
          {digit}
        </span>
      ))}
    </span>
  );
}

/** The factory sign. Days since each lab last reset everyone's usage. */
export function DaysSince({ board }: { board: PublicLeaderboardV1 }) {
  const days = board.global.daysSinceReset;
  return (
    <div className="panel flex flex-col justify-between gap-4 p-4">
      <p className="text-[11px] uppercase tracking-[0.22em] text-muted">
        days since last <span className={TOOL_TEXT[board.tool]}>{TOOL_SHORT[board.tool]}</span>{" "}
        reset
      </p>
      {days === null ? (
        <div>
          <p className="display text-3xl font-black text-broke sm:text-4xl">NO RESET</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-faint">
            on record. ever.
          </p>
        </div>
      ) : (
        <div>
          <CounterDigits value={String(days).padStart(3, "0")} />
          <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-faint">
            {days === 0 ? "reset landed today. it can be done." : "and counting."}
          </p>
        </div>
      )}
    </div>
  );
}

/** Median remaining %, drawn as a draining gauge against the poverty line. */
export function PovertyMeter({ board }: { board: PublicLeaderboardV1 }) {
  const median = board.global.medianRemainingPercent;
  const severity = severityFor(median);
  const value = median === null ? 0 : Math.max(0, Math.min(100, median));
  const tone = severity === "broke" ? "text-broke" : severity === "warn" ? "text-warn" : "text-ok";
  return (
    <div className="panel flex flex-col justify-between gap-4 p-4">
      <p className="text-[11px] uppercase tracking-[0.22em] text-muted">
        <span className={TOOL_TEXT[board.tool]}>{TOOL_SHORT[board.tool]}</span> median remaining
      </p>
      <div>
        <p className={`display text-3xl font-black tabular-nums sm:text-4xl ${tone}`}>
          {median === null ? "—" : `${Math.round(median * 10) / 10}%`}
        </p>
        <div
          className="relative mt-3 h-3 border border-line bg-ink"
          role="img"
          aria-label={`Median remaining ${median ?? "unknown"} percent; the poverty line sits at 10 percent`}
        >
          <div
            className={`meter-cells absolute inset-y-[2px] left-[2px] rounded-[5px] ${tone}`}
            style={{ width: `${value}%` }}
          />
          <div className="absolute inset-y-[-4px] left-[10%] w-px bg-broke" />
        </div>
        <p className="mt-1.5 flex justify-between text-[10px] uppercase tracking-[0.16em] text-faint">
          <span>0</span>
          <span className="text-broke">the poverty line</span>
          <span>100</span>
        </p>
      </div>
    </div>
  );
}
