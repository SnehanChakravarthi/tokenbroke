import { BRAND } from "@tokenbroke/shared";
import { GitHubMark } from "./icons";

async function starCount(): Promise<number | null> {
  try {
    const repoPath = new URL(BRAND.repoUrl).pathname;
    const response = await fetch(`https://api.github.com/repos${repoPath}`, {
      // Hourly is plenty for a vanity metric and stays far under GitHub's
      // unauthenticated rate limit even though the page itself is dynamic.
      next: { revalidate: 3600 },
      headers: { accept: "application/vnd.github+json" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { stargazers_count?: number };
    return typeof data.stargazers_count === "number" ? data.stargazers_count : null;
  } catch {
    return null;
  }
}

/** Open-source badge: the trust signal wears its star count. Degrades to a plain link. */
export async function GitHubBadge() {
  const stars = await starCount();
  return (
    <a
      href={BRAND.repoUrl}
      className="raised flex shrink-0 items-center gap-2 px-3 py-1.5 text-[11px] text-dim hover:text-paper"
      aria-label={`tokenbroke on GitHub${stars ? `, ${stars} stars` : ""}`}
    >
      <GitHubMark className="size-3.5" />
      <span className="font-semibold">open source</span>
      {stars !== null && stars > 0 && (
        <span className="flex items-center gap-1 border-l border-line pl-2 tabular-nums">
          <span aria-hidden className="text-warn">
            ★
          </span>
          {stars.toLocaleString("en-US")}
        </span>
      )}
    </a>
  );
}
