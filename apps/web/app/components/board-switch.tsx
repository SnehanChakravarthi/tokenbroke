"use client";

import { type ReactNode, useState } from "react";
import { ClaudeCodeMark, CodexMark } from "./icons";

const TABS = [
  { id: "codex" as const, title: "Codex", Mark: CodexMark, active: "border-codex/50" },
  {
    id: "claude-code" as const,
    title: "Claude Code",
    Mark: ClaudeCodeMark,
    active: "border-claude/50",
  },
];

/**
 * Below lg the two universes stack into a long scroll, so only the selected one
 * renders, picked by a segmented toggle. At lg+ both sit side by side and the
 * toggle disappears; the CSS owns that switch, so there's no hydration flicker.
 */
export function BoardSwitch({ codex, claude }: { codex: ReactNode; claude: ReactNode }) {
  const [active, setActive] = useState<"codex" | "claude-code">("codex");
  return (
    <div>
      <div
        role="tablist"
        aria-label="pick a universe"
        className="mb-4 flex justify-center gap-2 lg:hidden"
      >
        {TABS.map(({ id, title, Mark, active: activeBorder }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active === id}
            onClick={() => setActive(id)}
            className={`flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-colors duration-150 ${
              active === id
                ? `${activeBorder} bg-panel-2 text-paper`
                : "border-line bg-panel text-muted hover:text-dim"
            }`}
          >
            <Mark className="size-4" />
            {title}
          </button>
        ))}
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className={active === "codex" ? "" : "hidden lg:block"}>{codex}</div>
        <div className={active === "claude-code" ? "" : "hidden lg:block"}>{claude}</div>
      </div>
    </div>
  );
}
