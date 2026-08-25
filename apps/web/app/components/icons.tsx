// Official marks, used nominatively to label the tools being measured — not as endorsement
// (see the footer stance). Artwork supplied by the owner from each tool's official icon;
// both carry their own brand colors, so parents don't tint them.

export function ClaudeCodeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" role="img" aria-label="Claude Code" className={className}>
      <path
        d="M447.957 233.579H512v66.176h-64v64.597h-31.723v62.315H384v-62.315h-31.723v62.315H320v-62.315H192v62.315h-32.256v-62.315H128v62.315H95.723v-62.315H64v-64.619H0V233.6h64V106.667h383.957v126.912zm-319.957 0h31.744v-60.736H128v60.736zm224.213 0H384v-60.736h-31.787v60.736z"
        fill="#D97757"
      />
    </svg>
  );
}

/**
 * The Codex gradient lives in ONE always-rendered 0x0 svg (mounted in the root layout).
 * Per-instance defs broke desktop: every mark referenced the first defs in the DOM,
 * which sat inside the lg:hidden board toggle, and display:none defs resolve to nothing.
 */
export function CodexMarkDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient
          id="codex-mark-grad"
          x1="12"
          y1="3"
          x2="12"
          y2="21"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#b1a7ff" />
          <stop offset="0.5" stopColor="#7a9dff" />
          <stop offset="1" stopColor="#3941ff" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function CodexMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label="OpenAI Codex" className={className}>
      <path
        d="M9.064 3.344a4.578 4.578 0 012.285-.312c1 .115 1.891.54 2.673 1.275.01.01.024.017.037.021a.104.104 0 00.043 0 4.556 4.556 0 013.046.275l.047.022.116.057a4.585 4.585 0 012.188 2.399c.209.51.313 1.041.315 1.595.015.412-.03.824-.134 1.223a.124.124 0 00.03.115c.594.607.988 1.33 1.183 2.17.289 1.425-.007 2.71-.887 3.854l-.136.166a4.548 4.548 0 01-2.201 1.388.12.12 0 00-.081.076c-.191.551-.383 1.023-.74 1.494-.9 1.187-2.222 1.846-3.711 1.838-1.187-.006-2.239-.44-3.157-1.302a.109.109 0 00-.105-.024c-.388.125-.78.143-1.204.138a4.438 4.438 0 01-1.945-.466 4.553 4.553 0 01-1.61-1.335c-.152-.202-.303-.392-.414-.617a5.797 5.797 0 01-.37-.961 4.575 4.575 0 01-.014-2.298.133.133 0 00.006-.056.083.083 0 00-.027-.048 4.467 4.467 0 01-1.034-1.651 3.898 3.898 0 01-.251-1.192 5.193 5.193 0 01.141-1.6c.337-1.112.982-1.985 1.933-2.618.212-.141.413-.251.601-.33a6.29 6.29 0 01.646-.227.1.1 0 00.065-.066 4.512 4.512 0 01.829-1.615 4.54 4.54 0 011.837-1.388zm3.482 10.565a.64.64 0 00-.601.636.64.64 0 00.601.636h3.636l.036.001a.64.64 0 00.637-.637.64.64 0 00-.637-.637l-.036.001h-3.636zM8.462 9.23a.64.64 0 00-.543-.304.64.64 0 00-.563.935l1.272 2.224-1.266 2.136a.638.638 0 001.095.649l1.454-2.455a.637.637 0 00.005-.64L8.462 9.23z"
        fill="url(#codex-mark-grad)"
      />
    </svg>
  );
}

export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label="GitHub"
      className={className}
      fill="currentColor"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}
