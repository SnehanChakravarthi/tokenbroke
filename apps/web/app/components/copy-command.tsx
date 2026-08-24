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
      className="group inline-flex w-full items-center justify-between gap-6 border border-line bg-panel px-5 py-4 text-left transition-colors hover:border-ember/60 sm:w-auto sm:min-w-[26rem]"
      aria-label={`Copy ${command}`}
    >
      <span className="text-lg text-paper sm:text-xl">
        <span className="text-faint">$ </span>
        {command}
      </span>
      <span className="shrink-0 text-[11px] uppercase tracking-[0.2em] text-muted transition-colors group-hover:text-ember">
        {copied ? "copied" : "copy"}
      </span>
    </button>
  );
}
