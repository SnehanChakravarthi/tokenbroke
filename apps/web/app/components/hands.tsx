import Image from "next/image";

const HANDS = [
  {
    handle: "thsottiaux",
    name: "Tibo Sottiaux",
    role: "Codex · OpenAI",
    tone: "text-codex",
  },
  {
    handle: "bcherny",
    name: "Boris Cherny",
    role: "Claude Code · Anthropic",
    tone: "text-claude",
  },
] as const;

/**
 * The two hands that eventually have to play — a footnote-sized badge row, not a
 * billboard: the faces stay legible, but the command is the hero.
 */
export function TheHands() {
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <p className="text-center text-[11px] uppercase tracking-[0.22em] text-muted">
        this record exists to move two hands
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {HANDS.map((hand) => (
          <a
            key={hand.handle}
            href={`https://x.com/${hand.handle}`}
            title={`${hand.name} — ${hand.role}`}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-panel py-1 pl-1 pr-3 transition-colors duration-150 hover:border-paper/30"
          >
            <Image
              src={`https://unavatar.io/x/${hand.handle}`}
              alt={`${hand.name}'s profile picture`}
              width={20}
              height={20}
              className="rounded-full outline outline-1 -outline-offset-1 outline-white/10"
            />
            <span className={`text-xs font-semibold ${hand.tone}`}>@{hand.handle}</span>
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
