import Image from "next/image";

const HANDS = [
  {
    handle: "thsottiaux",
    name: "Tibo Sottiaux",
    role: "Codex · OpenAI",
    ring: "ring-codex/50",
    tone: "text-codex",
  },
  {
    handle: "bcherny",
    name: "Boris Cherny",
    role: "Claude Code · Anthropic",
    ring: "ring-claude/50",
    tone: "text-claude",
  },
] as const;

/**
 * The two hands that eventually have to play. Affectionate by design:
 * faces, not targets — the endgame is these two reading this page.
 */
export function TheHands() {
  return (
    <div className="flex w-full flex-col items-center gap-5">
      <p className="text-center text-[11px] uppercase tracking-[0.22em] text-muted">
        this record exists to move two hands
      </p>
      <div className="grid w-full max-w-md grid-cols-2 gap-3 sm:gap-4">
        {HANDS.map((hand) => (
          <a
            key={hand.handle}
            href={`https://x.com/${hand.handle}`}
            className="panel flex flex-col items-center gap-3 rounded-2xl px-3 py-5 text-center transition-transform duration-150 hover:-translate-y-0.5 active:scale-[0.98]"
          >
            <Image
              src={`https://unavatar.io/x/${hand.handle}`}
              alt={`${hand.name}'s profile picture`}
              width={56}
              height={56}
              className={`rounded-full outline outline-1 -outline-offset-1 outline-white/10 ring-2 ${hand.ring}`}
            />
            <span>
              <span className={`block text-sm font-semibold ${hand.tone}`}>@{hand.handle}</span>
              <span className="mt-0.5 block text-[11px] text-dim">{hand.name}</span>
              <span className="mt-1 block text-[9px] uppercase tracking-[0.14em] text-faint">
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
