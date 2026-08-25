"use client";

import { type ReactNode, useState } from "react";
import { ClaudeCodeMark, CodexMark } from "./icons";

const TABS = [
  { id: "codex" as const, title: "Codex", Mark: CodexMark },
  { id: "claude-code" as const, title: "Claude Code", Mark: ClaudeCodeMark },
];

/**
 * Below lg the two universes stack into a long scroll, so only the selected one
 * renders, picked from a single segmented pill: the active segment expands to
 * reveal its name, the inactive one collapses to its mark. At lg+ both boards
 * sit side by side and the pill disappears; CSS owns that switch, so there is
 * no hydration flicker.
 */
export function BoardSwitch({ codex, claude }: { codex: ReactNode; claude: ReactNode }) {
  const [active, setActive] = useState<"codex" | "claude-code">("codex");
  return (
    <div>
      <div className="mb-4 flex justify-center lg:hidden">
        <div
          role="tablist"
          aria-label="pick a universe"
          className="well flex items-center gap-1 p-1 [--well-radius:999px]"
        >
          {TABS.map(({ id, title, Mark }) => {
            const selected = active === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={title}
                onClick={() => setActive(id)}
                className={`flex min-h-9 items-center rounded-full px-3 transition-colors duration-200 ${
                  selected ? "keycap text-paper" : "text-muted hover:text-dim active:scale-[0.96]"
                }`}
              >
                <Mark className="size-4 shrink-0" />
                <span
                  className={`overflow-hidden whitespace-nowrap text-xs font-semibold transition-[max-width,opacity,margin-left] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                    selected ? "ml-2 max-w-[6.5rem] opacity-100" : "ml-0 max-w-0 opacity-0"
                  }`}
                >
                  {title}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className={active === "codex" ? "" : "hidden lg:block"}>{codex}</div>
        <div className={active === "claude-code" ? "" : "hidden lg:block"}>{claude}</div>
      </div>
    </div>
  );
}
