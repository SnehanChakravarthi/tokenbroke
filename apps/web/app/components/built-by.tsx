import Image from "next/image";

/**
 * Fixed maker credit: the board travels as screenshots, and the corner pill is
 * the only credit that travels with them. Straight link, no popup — one product.
 */
export function BuiltBy() {
  return (
    <a
      href="https://x.com/theteknosaur"
      target="_blank"
      rel="noopener noreferrer"
      className="raised fixed bottom-4 right-4 z-40 flex items-center gap-2 py-1.5 pl-3 pr-1.5 text-[11px] text-dim transition-colors duration-150 hover:text-paper"
    >
      built by <span className="font-semibold text-paper">@theteknosaur</span>
      <Image
        src="https://unavatar.io/x/theteknosaur"
        alt="Snehan Chakravarthi's profile picture"
        width={22}
        height={22}
        className="rounded-full outline outline-1 -outline-offset-1 outline-white/10"
      />
    </a>
  );
}
