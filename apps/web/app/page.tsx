import { BRAND } from "@tokenbroke/shared";
import { headers } from "next/headers";
import { siteDatabase } from "@/src/lib/dev-db";
import { getPublicLeaderboard } from "@/src/lib/leaderboard";
import { movementStats } from "@/src/lib/movement";
import { recordPageView, viewStats } from "@/src/lib/views";
import { LabUniverse } from "./components/board";
import { CopyCommand } from "./components/copy-command";
import { FlapDigits } from "./components/flap";
import { severityFor } from "./components/format";
import { TheHands } from "./components/hands";
import { nextMilestone, TheLoop } from "./components/loop";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ claimed?: string }>;
}) {
  const { claimed: justClaimed } = await searchParams;
  const now = new Date();
  const database = await siteDatabase();
  const requestHeaders = await headers();
  const visitorIp =
    requestHeaders.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
    requestHeaders.get("x-forwarded-for")?.split(",").at(-1)?.trim() ??
    null;
  await recordPageView(database, visitorIp, now);
  const [codex, claude, movement, views] = await Promise.all([
    getPublicLeaderboard("codex", { now, database }),
    getPublicLeaderboard("claude-code", { now, database }),
    movementStats(database),
    viewStats(database, now),
  ]);
  const boards = [codex, claude];
  const worst = boards
    .map((board) => severityFor(board.global.medianRemainingPercent))
    .reduce((left, right) =>
      left === "broke" || right === "broke"
        ? "broke"
        : left === "warn" || right === "warn"
          ? "warn"
          : "ok",
    );
  const glow =
    worst === "broke"
      ? "rgba(232, 67, 46, 0.10)"
      : worst === "warn"
        ? "rgba(212, 148, 20, 0.10)"
        : "rgba(24, 169, 87, 0.08)";

  return (
    <div className="min-h-screen" style={{ "--glow-color": glow } as React.CSSProperties}>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 pt-5 sm:px-6">
        <p className="display text-lg font-black tracking-tight text-paper">
          {BRAND.name}
          <span className="text-broke">{BRAND.domain.slice(BRAND.name.length)}</span>
        </p>
        <div className="flex items-center gap-4">
          <p className="hidden text-[10px] uppercase tracking-[0.18em] text-faint sm:block">
            unaffiliated parody · reads local usage data only
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Hero: the whole story in one read — question, purpose, the hands, the ask. */}
        <section className="fade-up flex flex-col items-center pt-10 text-center sm:pt-14">
          <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-line bg-panel px-4 py-1.5 text-[10px] uppercase tracking-[0.18em] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="pip inline-block size-1.5 rounded-full bg-ok" aria-hidden />
              <FlapDigits
                value={views.onlineNow.toLocaleString("en-US")}
                charClassName="tabular-nums text-paper"
                gapClassName="gap-0"
              />{" "}
              online now
            </span>
            <span className="text-faint" aria-hidden>
              ·
            </span>
            <span>
              <FlapDigits
                value={views.totalViews.toLocaleString("en-US")}
                charClassName="tabular-nums text-paper"
                gapClassName="gap-0"
              />{" "}
              views
            </span>
          </p>
          <h1 className="display mt-8 max-w-3xl text-[clamp(2.6rem,11vw,5.5rem)] font-black leading-[0.95] tracking-tight text-paper [text-wrap:balance]">
            ARE YOU <span className="text-broke">TOKENBROKE?</span>
          </h1>
          <p className="display mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-2xl font-black tracking-tight text-paper sm:text-4xl">
            <FlapDigits
              value={movement.devsOnRecord.toLocaleString("en-US")}
              label={`${movement.devsOnRecord.toLocaleString("en-US")} developers on the record`}
              gapClassName="gap-[3px]"
              charClassName="keycap inline-block min-w-[0.85em] px-1 py-0.5 text-center tabular-nums"
            />
            <span>of us are.</span>
          </p>
          {nextMilestone(movement.devsOnRecord) && (
            <p className="mt-4 text-[11px] uppercase tracking-[0.16em] text-muted">
              <span className="pip mr-1.5 inline-block size-1.5 rounded-full bg-broke align-middle" />
              <span className="text-paper">
                {(
                  (nextMilestone(movement.devsOnRecord)?.at ?? 0) - movement.devsOnRecord
                ).toLocaleString("en-US")}{" "}
                to "{nextMilestone(movement.devsOnRecord)?.label}"
              </span>{" "}
              — you count
            </p>
          )}
          <p className="mt-7 max-w-lg text-sm leading-relaxed text-dim sm:text-base">
            The public record of how rate-limited developers really are —{" "}
            <span className="text-paper">measured by us, because nobody else will.</span>
          </p>

          <div className="fade-up fade-up-1 mt-10">
            <TheHands />
          </div>

          <div className="fade-up fade-up-2 mt-10 flex flex-col items-center">
            <p className="mb-4 text-center leading-snug">
              <span className="block whitespace-nowrap text-[13px] text-dim sm:text-[15px]">
                That's one small command for a dev —
              </span>
              <span className="display mt-0.5 block whitespace-nowrap text-base font-extrabold tracking-tight text-paper sm:text-lg">
                one giant leap for devkind.
              </span>
            </p>
            <CopyCommand command={BRAND.cliCommand} />
            <p className="mt-3 text-[10px] uppercase tracking-[0.16em] leading-relaxed text-muted">
              reads 2 numbers — never your code
              <span className="mx-2 text-faint">·</span>anonymous, no signup
              <span className="mx-2 text-faint">·</span>auto-updates:{" "}
              <span className="text-dim">hooks install</span>
            </p>
          </div>
        </section>

        {/* The loop: why one row matters. */}
        <section className="fade-up fade-up-2 mt-14" aria-label="How it works">
          <TheLoop stats={movement} boards={boards} />
        </section>

        {justClaimed && (
          <div className="fade-up mx-auto mt-10 flex max-w-md items-center justify-center gap-2 rounded-full border border-ok/40 bg-ok/10 px-5 py-2.5 text-center text-sm text-ok">
            <span aria-hidden>✓</span> welcome to the record,{" "}
            <span className="font-semibold">@{justClaimed.slice(0, 40)}</span> — that's you below.
          </div>
        )}
        <section className="fade-up fade-up-3 mt-14 grid items-start gap-5 lg:grid-cols-2">
          <LabUniverse board={codex} now={now} highlight={justClaimed ?? null} />
          <LabUniverse board={claude} now={now} highlight={justClaimed ?? null} />
        </section>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-3 text-[11px] leading-relaxed text-faint sm:flex-row sm:justify-between">
          <p className="max-w-md">
            {BRAND.name} is an unaffiliated parody and community tool. Not endorsed by, associated
            with, or speaking for OpenAI or Anthropic. The bit is affectionate — the endgame is the
            labs reading this page. The data is serious.
          </p>
          <p className="max-w-md sm:text-right">
            The CLI reads usage and rate-limit state from your machine, on your machine, and submits
            only when you run it. Never prompts, never code, never conversations.
            <span className="mt-2 block text-muted">
              built by{" "}
              <a
                href="https://x.com/theteknosaur"
                className="text-paper underline decoration-dotted underline-offset-2"
              >
                Snehan Chakravarthi
              </a>{" "}
              · @theteknosaur
            </span>
          </p>
        </div>
      </footer>
    </div>
  );
}
