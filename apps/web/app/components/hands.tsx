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
      title={`${hand.name} · ${hand.role}`}
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
 * The whole thesis in one breath: what this is, who can end it, and why your row
 * matters — with the two hands inlined as badges so faces stay legible without
 * taking over the hero.
 */
export function TheHands() {
  const [tibo, boris] = HANDS;
  return (
    <p className="mx-auto max-w-xl text-center text-sm leading-[1.9] text-dim sm:text-base">
      <span className="text-paper">They meter our tokens. We meter the misery.</span> A public
      leaderboard of rate-limited developers: real usage, straight from our machines. Resets come
      from two hands, <HandBadge hand={tibo} /> <span className="text-faint">(Codex)</span> and{" "}
      <HandBadge hand={boris} /> <span className="text-faint">(Claude Code)</span>.{" "}
      <span className="text-paper">Enough of us on the record forces them to play.</span>{" "}
      <span className="text-faint">(affectionately)</span>
    </p>
  );
}
