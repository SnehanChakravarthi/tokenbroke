import { BRAND, type LeaderboardRow, ordinal } from "@tokenbroke/shared";
import Link from "next/link";
import { siteDatabase } from "@/src/lib/dev-db";
import { getPublicLeaderboard, type PublicLeaderboardV1 } from "@/src/lib/leaderboard";
import { ToolLockup } from "../../components/board";
import { resetsIn } from "../../components/format";
import { ClaudeCodeMark, CodexMark } from "../../components/icons";

export const dynamic = "force-dynamic";

const TOOL = {
  codex: { title: "CODEX", accent: "text-codex", Mark: CodexMark },
  "claude-code": { title: "CLAUDE CODE", accent: "text-claude", Mark: ClaudeCodeMark },
} as const;

function remainingTone(remaining: number): string {
  if (remaining <= 3) return "text-broke";
  if (remaining <= 15) return "text-broke/75";
  return "text-paper";
}

function findRow(board: PublicLeaderboardV1, name: string): LeaderboardRow | null {
  const needle = name.toLowerCase();
  return board.rows.find((row) => row.name.toLowerCase() === needle) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const decoded = decodeURIComponent(name).slice(0, 60);
  return { title: `${decoded} — ${BRAND.domain}` };
}

/**
 * One developer's standing, at a shareable URL. This is also where a fresh claim lands:
 * on a board of thousands nobody scrolls to row 3,207, but everyone can look at their own page.
 */
export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ claimed?: string }>;
}) {
  const [{ name: rawName }, { claimed }] = await Promise.all([params, searchParams]);
  const name = decodeURIComponent(rawName).slice(0, 60);
  const now = new Date();
  const database = await siteDatabase();
  const [codex, claude] = await Promise.all([
    getPublicLeaderboard("codex", { now, database }),
    getPublicLeaderboard("claude-code", { now, database }),
  ]);
  const entries = [codex, claude].map((board) => ({ board, row: findRow(board, name) }));
  const found = entries.filter(
    (entry): entry is { board: PublicLeaderboardV1; row: LeaderboardRow } => entry.row !== null,
  );
  const identity = found[0]?.row ?? null;
  const bestRank = found.length ? Math.min(...found.map(({ row }) => row.rank)) : null;

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 pt-5 sm:px-6">
        <Link href="/" className="display text-lg font-black tracking-tight text-paper">
          {BRAND.name}
          <span className="text-broke">{BRAND.domain.slice(BRAND.name.length)}</span>
        </Link>
        <p className="hidden text-[10px] uppercase tracking-[0.18em] text-faint sm:block">
          unaffiliated parody · reads local usage data only
        </p>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 pb-16 pt-12 text-center sm:px-6">
        {claimed && (
          <div className="fade-up mb-8 flex items-center gap-2 rounded-full border border-ok/40 bg-ok/10 px-5 py-2.5 text-sm text-ok">
            <span aria-hidden>✓</span> row claimed. this page is yours now — share the link.
          </div>
        )}

        <div className="fade-up flex flex-col items-center">
          {identity?.avatarUrl ? (
            <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full ring-2 ring-line">
              {/* Plain img on purpose: avatar hosts come from OAuth data, and next/image
                  hard-crashes the page on any host it wasn't configured for. */}
              {/* biome-ignore lint/performance/noImgElement: avoids the host-allowlist crash */}
              <img
                src={identity.avatarUrl}
                alt={`${name}'s avatar`}
                width={80}
                height={80}
                referrerPolicy="no-referrer"
                className="size-full object-cover outline outline-1 -outline-offset-1 outline-white/10"
              />
            </span>
          ) : (
            <span
              aria-hidden
              className="keycap grid size-20 place-items-center rounded-2xl text-3xl font-bold uppercase text-faint"
            >
              {name.slice(0, 1) || "?"}
            </span>
          )}
          <h1 className="display mt-5 max-w-full break-words text-3xl font-black tracking-tight text-paper sm:text-4xl">
            {name}
          </h1>
          {identity ? (
            <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted">
              {identity.claimed ? "claimed · on the record" : "anonymous · on the record"}
            </p>
          ) : (
            <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted">
              no fresh reading on record
            </p>
          )}
          {bestRank !== null && (
            <p className="mt-4 text-sm leading-relaxed text-dim">
              the <span className="font-semibold text-broke">{ordinal(bestRank)}</span> brokest
              developer alive. charity declined.
            </p>
          )}
        </div>

        {found.length > 0 ? (
          <div className="fade-up fade-up-1 mt-10 grid w-full gap-4 sm:grid-cols-2">
            {entries.map(({ board, row }) => {
              const { title, accent, Mark } = TOOL[board.tool];
              return (
                <section
                  key={board.tool}
                  aria-label={`${title} standing`}
                  className="panel relative overflow-hidden rounded-2xl p-5 text-left"
                >
                  <Mark className="pointer-events-none absolute -right-5 -top-5 size-24 rotate-[-12deg] opacity-[0.07]" />
                  <h2>
                    <ToolLockup tool={board.tool} />
                  </h2>
                  {row ? (
                    <>
                      <p className="display mt-4 text-4xl font-black tabular-nums text-paper">
                        #{row.rank}
                        <span className="ml-2 align-middle text-[11px] font-normal uppercase tracking-[0.18em] text-muted">
                          of {board.rows.length} on the board
                        </span>
                      </p>
                      <dl className="mt-4 space-y-2 text-sm">
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-[10px] uppercase tracking-[0.16em] text-muted">
                            tokens left
                          </dt>
                          <dd
                            className={`font-semibold tabular-nums ${remainingTone(row.remainingPercent)}`}
                          >
                            {Math.round(row.remainingPercent * 10) / 10}%
                          </dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-[10px] uppercase tracking-[0.16em] text-muted">
                            resets in
                          </dt>
                          <dd className="tabular-nums text-dim">{resetsIn(row.resetsAt, now)}</dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-[10px] uppercase tracking-[0.16em] text-muted">
                            plan
                          </dt>
                          <dd className="text-dim">{row.plan ?? "unknown"}</dd>
                        </div>
                        {row.modelScoped && (
                          <div className="flex items-baseline justify-between gap-3">
                            <dt className="text-[10px] uppercase tracking-[0.16em] text-muted">
                              {row.modelScoped.label}
                            </dt>
                            <dd className={`tabular-nums ${accent}`}>
                              {row.modelScoped.remainingPercent}% left
                            </dd>
                          </div>
                        )}
                      </dl>
                    </>
                  ) : (
                    <p className="mt-6 text-sm leading-relaxed text-muted">
                      no fresh reading for this tool.
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="fade-up fade-up-1 panel mt-10 w-full rounded-2xl px-6 py-8">
            <p className="text-sm leading-relaxed text-dim">
              nobody by this name has a fresh reading. rows go quiet after 24 hours of silence — one
              command puts you back on the record:
            </p>
            <p className="mt-4 text-lg text-paper">
              <span className="text-faint">$ </span>
              {BRAND.cliCommand}
            </p>
          </div>
        )}

        <Link
          href="/"
          className="raised fade-up fade-up-2 mt-10 inline-block px-5 py-3 text-[11px] uppercase tracking-[0.2em] text-dim transition-colors hover:text-paper"
        >
          see the full record →
        </Link>
        {identity && (
          <p className="fade-up fade-up-2 mt-6 text-[10px] uppercase tracking-[0.16em] text-faint">
            this page re-renders every time {identity.claimed ? "you run" : "its owner runs"}{" "}
            {BRAND.cliCommand}
          </p>
        )}
      </main>
    </div>
  );
}
