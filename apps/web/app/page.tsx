import { BRAND } from "@tokenbroke/shared";
import { headers } from "next/headers";
import Image from "next/image";
import wordmark from "@/public/tokenbroke-3d.png";
import { siteDatabase } from "@/src/lib/dev-db";
import { getPublicLeaderboard } from "@/src/lib/leaderboard";
import { movementStats } from "@/src/lib/movement";
import { recordPageView, viewStats } from "@/src/lib/views";
import { LabUniverse } from "./components/board";
import { CommandExplainer } from "./components/command-explainer";
import { CopyCommand } from "./components/copy-command";
import { FlapDigits } from "./components/flap";
import { severityFor } from "./components/format";
import { GitHubBadge } from "./components/github-badge";
import { TheHands } from "./components/hands";
import { GitHubMark } from "./components/icons";
import { TheLoop } from "./components/loop";

export const dynamic = "force-dynamic";

export default async function Home() {
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
          <p className="hidden text-[10px] uppercase tracking-[0.18em] text-faint md:block">
            unaffiliated parody · reads local usage data only
          </p>
          <GitHubBadge />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Hero: the whole story in one read — question, purpose, the hands, the ask. */}
        <section className="fade-up relative z-30 flex flex-col items-center pt-10 text-center sm:pt-14">
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
          <h1 className="relative mt-9 flex w-full flex-col items-center">
            <span className="display text-[clamp(1.9rem,6.5vw,3.4rem)] font-black leading-none tracking-tight text-paper">
              ARE YOU
            </span>
            {/* The wordmark rides over ARE YOU, tilted like a slapped-on sticker. */}
            <span className="relative z-10 -mt-1 block w-[min(90vw,46rem)] rotate-[-3.5deg] sm:-mt-2">
              <Image src={wordmark} alt="TOKENBROKE?" priority className="h-auto w-full" />
            </span>
          </h1>
          <p className="display mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-2xl font-black tracking-tight text-paper sm:mt-2 sm:text-4xl">
            <FlapDigits
              value={movement.devsOnRecord.toLocaleString("en-US")}
              label={`${movement.devsOnRecord.toLocaleString("en-US")} developers on the record`}
              gapClassName="gap-[3px]"
              charClassName="keycap inline-block min-w-[0.85em] px-1 py-0.5 text-center tabular-nums"
            />
            <span>of us are.</span>
          </p>
          <div className="fade-up fade-up-1 mt-8">
            <TheHands />
          </div>

          <div className="fade-up fade-up-2 mt-10 flex w-full flex-col items-center">
            <p className="mb-4 max-w-lg text-center text-[13px] leading-relaxed text-dim [text-wrap:balance]">
              That&apos;s one small command for a dev,{" "}
              <span className="display text-sm font-extrabold tracking-tight text-paper">
                one giant leap for devkind.
              </span>
            </p>
            <CopyCommand command={BRAND.cliCommand} />
            <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
              <a
                href={BRAND.repoUrl}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-dim transition-colors duration-150 hover:border-paper/30 hover:text-paper"
              >
                <GitHubMark className="size-3" aria-hidden />
                open source · mit
              </a>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-muted">
                <span aria-hidden className="text-ok">
                  ✓
                </span>
                never reads your code
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-muted">
                <span aria-hidden className="text-ok">
                  ✓
                </span>
                anonymous by default
              </span>
              <CommandExplainer />
            </div>
          </div>
        </section>

        {/* The loop: why one row matters. */}
        <section className="fade-up fade-up-2 mt-14" aria-label="How it works">
          <TheLoop stats={movement} boards={boards} />
        </section>

        <section className="fade-up fade-up-3 mt-14 grid items-start gap-5 lg:grid-cols-2">
          <LabUniverse board={codex} now={now} />
          <LabUniverse board={claude} now={now} />
        </section>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-3 text-[11px] leading-relaxed text-faint sm:flex-row sm:justify-between">
          <p className="max-w-md">
            {BRAND.name} is an unaffiliated parody and community tool. Not endorsed by, associated
            with, or speaking for OpenAI or Anthropic. The bit is affectionate; the endgame is the
            labs reading this page. The data is serious.
            <span className="mt-2 block">
              <a
                href={BRAND.repoUrl}
                className="text-muted underline decoration-dotted underline-offset-2 hover:text-paper"
              >
                open source under MIT
              </a>
              : every line of the CLI and this site.
            </span>
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
