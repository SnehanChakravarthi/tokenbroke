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
      target="_blank"
      rel="noopener noreferrer"
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
    <div className="mx-auto max-w-xl space-y-3 text-center text-sm leading-[1.8] text-dim sm:text-base">
      <p>
        <span className="text-paper">
          This is the public leaderboard of rate-limited developers,
        </span>{" "}
        built from real usage on our own machines.
      </p>
      <p>
        The two hands closest to the reset button: <HandBadge hand={tibo} />{" "}
        <span className="text-faint">(Codex)</span> and <HandBadge hand={boris} />{" "}
        <span className="text-faint">(Claude Code)</span>.{" "}
        <span className="text-paper">We intend to move them.</span>
      </p>
    </div>
  );
}
