"use client";

import { BRAND } from "@tokenbroke/shared";
import type { ReactNode } from "react";
import { useRef, useState } from "react";

const FACTS: ReadonlyArray<{ id: string; yes: boolean; text: ReactNode }> = [
  {
    id: "oss",
    yes: true,
    text: (
      <>
        100% open source under MIT —{" "}
        <a
          href={BRAND.repoUrl}
          className="text-dim underline decoration-dotted underline-offset-2 hover:text-paper"
        >
          audit the exact code on GitHub
        </a>
      </>
    ),
  },
  {
    id: "reads",
    yes: true,
    text: "reads the usage + rate-limit numbers Claude Code and Codex already keep on your machine — the same stats you see in /usage",
  },
  { id: "never", yes: false, text: "never your code, prompts, conversations, or credentials" },
  {
    id: "anon",
    yes: true,
    text: "files one signed snapshot under an anonymous name, in ~5 seconds — claiming your row with GitHub later is optional",
  },
  {
    id: "hooks",
    yes: true,
    text: "asks first before installing the tiny keep-fresh hook that re-files after each session. uninstalling = deleting two lines",
  },
];

/** Estimated popover height used to decide whether to open above or below the trigger. */
const POP_HEIGHT = 360;

/** The fine print, one hover away: exactly what the command does and doesn't touch. */
export function CommandExplainer() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"above" | "below">("below");

  const openPopover = () => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      setPlacement(below < POP_HEIGHT && rect.top > below ? "above" : "below");
    }
    setOpen(true);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover is a mouse-only enhancement; keyboard/touch open via the button
    <div
      ref={wrapRef}
      className="relative flex justify-center"
      onMouseEnter={openPopover}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="command-facts"
        onClick={() => (open ? setOpen(false) : openPopover())}
        onFocus={openPopover}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className="relative inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-muted transition-colors duration-150 after:absolute after:-inset-x-1 after:-inset-y-2 after:content-[''] hover:border-paper/30 hover:text-paper"
      >
        <svg viewBox="0 0 16 16" className="size-3 shrink-0" aria-hidden="true" fill="none">
          <circle cx="8" cy="8" r="6.75" stroke="currentColor" strokeWidth="1.25" />
          <path d="M8 7.4v3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="5" r="0.9" fill="currentColor" />
        </svg>
        what does it do?
      </button>
      {open && (
        <div
          id="command-facts"
          role="note"
          className={`pop panel absolute left-1/2 z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl p-4 text-left ${
            placement === "below" ? "pop-below top-full mt-1.5" : "pop-above bottom-full mb-1.5"
          }`}
        >
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted">
            what <span className="normal-case text-paper">{BRAND.cliCommand}</span> actually runs
          </p>
          <ul className="mt-3 space-y-2.5">
            {FACTS.map((fact) => (
              <li key={fact.id} className="flex gap-2.5 text-[12px] leading-relaxed text-dim">
                <span aria-hidden className={fact.yes ? "text-ok" : "text-broke"}>
                  {fact.yes ? "✓" : "✗"}
                </span>
                <span>{fact.text}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-line-soft pt-2.5 text-[10px] leading-relaxed text-faint">
            everything runs locally, and submits only when you (or your hook) run it. don&apos;t
            trust us —{" "}
            <a
              href={BRAND.repoUrl}
              className="text-dim underline decoration-dotted underline-offset-2 hover:text-paper"
            >
              read every line (MIT)
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}
