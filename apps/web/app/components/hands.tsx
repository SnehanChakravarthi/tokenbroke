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

function HandBadge({ hand }: { hand: (typeof HANDS)[number] }) {
  return (
    <a
      href={`https://x.com/${hand.handle}`}
      title={`${hand.name} — ${hand.role}`}
      className="mx-0.5 inline-flex -translate-y-px items-center gap-1.5 rounded-full border border-line bg-panel py-0.5 pl-0.5 pr-2 align-middle transition-colors duration-150 hover:border-paper/30"
    >
      <Image
        src={`https://unavatar.io/x/${hand.handle}`}
        alt={`${hand.name}'s profile picture`}
        width={18}
        height={18}
        className="rounded-full outline outline-1 -outline-offset-1 outline-white/10"
      />
      <span className={`text-xs font-semibold ${hand.tone}`}>@{hand.handle}</span>
    </a>
  );
}

/**
 * The whole thesis in one breath, with the two hands inlined as badges —
 * faces stay legible, the command stays the hero.
 */
export function TheHands() {
  const [tibo, boris] = HANDS;
  return (
    <p className="mx-auto max-w-xl text-center text-sm leading-[1.9] text-dim sm:text-base">
      The public record of how rate-limited developers really are —{" "}
      <span className="text-paper">measured by us, because nobody else will.</span> It exists to
      move two hands, <HandBadge hand={tibo} /> and <HandBadge hand={boris} />: when enough of us
      are on it, <span className="text-paper">resets get scheduled, budgets get bigger,</span> and
      intelligence gets <span className="text-paper">distributed — not rationed.</span>{" "}
      <span className="text-faint">(affectionately)</span>
    </p>
  );
}
