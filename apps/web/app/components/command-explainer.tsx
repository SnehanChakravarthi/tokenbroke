"use client";

import { BRAND } from "@tokenbroke/shared";
import { useState } from "react";

const FACTS = [
  {
    yes: true,
    text: "reads the usage + rate-limit numbers Claude Code and Codex already keep on your machine — the same stats you see in /usage",
  },
  { yes: false, text: "never your code, prompts, conversations, or credentials" },
  { yes: true, text: "files one signed snapshot under an anonymous name — no signup, ~5 seconds" },
  {
    yes: true,
    text: "asks first before installing the tiny keep-fresh hook that re-files after each session. uninstalling = deleting two lines",
  },
] as const;

/** The fine print, one hover away: exactly what the command does and doesn't touch. */
export function CommandExplainer() {
  const [open, setOpen] = useState(false);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover is a mouse-only enhancement; keyboard/touch open via the button
    <div
      className="relative flex justify-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="command-facts"
        onClick={() => setOpen((value) => !value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className="inline-flex min-h-10 items-center gap-1.5 text-[11px] text-muted underline decoration-faint decoration-dotted underline-offset-4 transition-colors duration-150 hover:text-paper"
      >
        what does this command actually do?
        <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" aria-hidden="true" fill="none">
          <circle cx="8" cy="8" r="6.75" stroke="currentColor" strokeWidth="1.25" />
          <path d="M8 7.4v3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="5" r="0.9" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div
          id="command-facts"
          role="note"
          className="pop panel absolute left-1/2 top-full z-20 mt-1.5 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl p-4 text-left"
        >
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted">
            what <span className="normal-case text-paper">{BRAND.cliCommand}</span> actually runs
          </p>
          <ul className="mt-3 space-y-2.5">
            {FACTS.map((fact) => (
              <li key={fact.text} className="flex gap-2.5 text-[12px] leading-relaxed text-dim">
                <span aria-hidden className={fact.yes ? "text-ok" : "text-broke"}>
                  {fact.yes ? "✓" : "✗"}
                </span>
                <span>{fact.text}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-line-soft pt-2.5 text-[10px] leading-relaxed text-faint">
            everything runs locally, and submits only when you (or your hook) run it.
          </p>
        </div>
      )}
    </div>
  );
}
