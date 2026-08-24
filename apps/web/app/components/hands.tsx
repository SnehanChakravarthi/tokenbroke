import Image from "next/image";

const HANDS = [
  {
    handle: "thsottiaux",
    name: "Tibo Sottiaux",
    role: "Codex · OpenAI",
    ring: "ring-codex/60",
    tone: "text-codex",
  },
  {
    handle: "bcherny",
    name: "Boris Cherny",
    role: "Claude Code · Anthropic",
    ring: "ring-claude/60",
    tone: "text-claude",
  },
] as const;

/**
 * The two hands that eventually have to play. Affectionate by design:
 * faces, not targets — the endgame is these two reading this page.
 */
export function TheHands() {
  return (
    <div className="flex flex-col items-center gap-5">
      <p className="text-[11px] uppercase tracking-[0.22em] text-muted">
        this record exists to move two hands
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {HANDS.map((hand) => (
          <a
            key={hand.handle}
            href={`https://x.com/${hand.handle}`}
            className="raised flex items-center gap-3 py-2 pl-2 pr-4"
          >
            <Image
              src={`https://unavatar.io/x/${hand.handle}`}
              alt={`${hand.name}'s profile picture`}
              width={36}
              height={36}
              className={`rounded-full ring-2 ${hand.ring}`}
            />
            <span className="text-left">
              <span className={`block text-sm font-semibold ${hand.tone}`}>@{hand.handle}</span>
              <span className="block text-[10px] uppercase tracking-[0.14em] text-muted">
                {hand.role}
              </span>
            </span>
          </a>
        ))}
      </div>
      <p className="max-w-lg text-center text-sm leading-relaxed text-dim">
        When enough of us are on the record, generosity stops being a support ticket and starts
        being policy: <span className="text-paper">resets get scheduled, budgets get bigger,</span>{" "}
        and intelligence gets <span className="text-paper">distributed — not rationed.</span>{" "}
        <span className="text-faint">(affectionately)</span>
      </p>
    </div>
  );
}
