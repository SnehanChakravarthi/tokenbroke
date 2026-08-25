"use client";

import { useState } from "react";

export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(command).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      className="well group flex w-full max-w-[24rem] items-center gap-3 px-5 py-4 text-left transition-transform duration-150 active:scale-[0.98]"
      aria-label={`Copy ${command}`}
    >
      <span aria-hidden className="select-none text-faint">
        $
      </span>
      <span className="flex-1 whitespace-nowrap text-lg text-paper sm:text-xl">{command}</span>
      <span
        className={`keycap min-w-[4.5rem] px-2.5 py-1 text-center text-[10px] uppercase tracking-[0.18em] transition-colors duration-150 ${
          copied ? "text-ok" : "text-muted group-hover:text-paper"
        }`}
      >
        {copied ? "copied" : "copy"}
      </span>
    </button>
  );
}
