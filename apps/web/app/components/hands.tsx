import Image from "next/image";
import Link from "next/link";

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
      className="inline-flex -translate-y-px items-center gap-1.5 rounded-full border border-line bg-panel py-0.5 pl-0.5 pr-2 align-middle transition-colors duration-150 hover:border-paper/30"
    >
      <Image
        src={`https://unavatar.io/x/${hand.handle}`}
        alt={`${hand.name}'s profile picture`}
        width={16}
        height={16}
        className="rounded-full outline outline-1 -outline-offset-1 outline-white/10"
      />
      <span className={`text-[11px] font-semibold ${hand.tone}`}>@{hand.handle}</span>
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
    <div className="mx-auto max-w-xl space-y-3.5 text-center">
      <p className="text-sm leading-[1.8] text-dim sm:text-base">
        <span className="text-paper">
          This is the public leaderboard of rate-limited developers,
        </span>{" "}
        built from real usage on our own machines.
      </p>
      <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-2 text-xs text-muted">
        aimed, affectionately, at <HandBadge hand={tibo} /> and <HandBadge hand={boris} />
        <span aria-hidden className="text-faint">
          ·
        </span>
        <Link
          href="/manifest"
          className="text-dim underline decoration-faint decoration-dotted underline-offset-4 transition-colors duration-150 hover:text-paper"
        >
          the manifest →
        </Link>
      </p>
    </div>
  );
}
