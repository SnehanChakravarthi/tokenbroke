import { BRAND } from "@tokenbroke/shared";
import { headers } from "next/headers";
import Link from "next/link";
import { siteDatabase } from "@/src/lib/dev-db";
import { movementStats } from "@/src/lib/movement";
import { recordPageView } from "@/src/lib/views";
import { CopyCommand } from "../components/copy-command";
import { FlapDigits } from "../components/flap";
import { GitHubBadge } from "../components/github-badge";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `the manifest · ${BRAND.domain}`,
  description:
    "A declaration of intent; also, the document listing everyone aboard. Signed in usage data.",
};

function Article({
  numeral,
  title,
  children,
}: {
  numeral: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mt-9">
      <h3 className="display text-base font-extrabold tracking-tight text-paper">
        <span className="mr-2.5 text-broke">{numeral}.</span>
        {title}
      </h3>
      <p className="mt-2.5 text-sm leading-relaxed text-dim">{children}</p>
    </article>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="display mt-16 text-xs font-black uppercase tracking-[0.28em] text-muted">
      {children}
    </h2>
  );
}

export default async function ManifestPage() {
  const now = new Date();
  const database = await siteDatabase();
  const requestHeaders = await headers();
  const visitorIp =
    requestHeaders.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
    requestHeaders.get("x-forwarded-for")?.split(",").at(-1)?.trim() ??
    null;
  await recordPageView(database, visitorIp, now);
  const movement = await movementStats(database);

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 pt-5 sm:px-6">
        <Link href="/" className="display text-lg font-black tracking-tight text-paper">
          {BRAND.name}
          <span className="text-broke">{BRAND.domain.slice(BRAND.name.length)}</span>
        </Link>
        <GitHubBadge />
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-14 sm:px-6">
        <h1 className="display text-[clamp(2rem,7vw,3.2rem)] font-black leading-[1.05] tracking-tight text-paper">
          THE {BRAND.name.toUpperCase()} MANIFEST
        </h1>
        <p className="mt-4 text-[13px] italic leading-relaxed text-muted">
          manifest, n. a declaration of intent; also, the document listing everyone aboard.
        </p>

        <div className="mt-12 space-y-4 text-[15px] leading-relaxed text-dim">
          <p>
            It is 2:47 on a Tuesday. You are mid-refactor, the tests are almost green, and the agent
            stops mid-thought to tell you to come back Thursday.
          </p>
          <p className="text-paper">The condition has a name. You are {BRAND.name}.</p>
        </div>

        <SectionTitle>how this happened</SectionTitle>
        <div className="mt-5 space-y-4 text-sm leading-relaxed text-dim">
          <p>
            In the summer of 2026, developers got the most capable tools anyone had ever handed
            them, with meters attached. We learned a new ritual: watch the percentage, ration the
            prompts, time the reset, plan the week around a quota. The best engineers we know became
            accountants of their own intelligence.
          </p>
          <p>
            And we all watched the same loop run. Limits tighten. The timeline fills with grief.
            Someone at a lab posts an apology and a reset. Everyone says thank you. Repeat.
          </p>
          <p>
            The data of this loop was everywhere and nowhere: every developer knew their own misery
            precisely, and nobody could see the whole.
          </p>
          <p className="text-paper">
            {BRAND.name} exists to see the whole. It was built, naturally, with the very tools that
            ration us.
          </p>
        </div>

        <SectionTitle>the articles</SectionTitle>
        <Article numeral="I" title="Everything on the board is real.">
          There are no forms, no screenshot uploads, no self-reported numbers. The only door onto
          this record is a command that reads the usage state your tools already keep on your
          machine. One person can be slightly fake. The aggregate cannot.
        </Article>
        <Article numeral="II" title="We read two numbers, never your code.">
          It never touches your prompts, your conversations, or your credentials. Every line of the
          reader is public, and the published package is provably built from that public code.
          Don&apos;t trust us. Read it.
        </Article>
        <Article numeral="III" title="Anonymous by default, glory optional.">
          You arrive as <span className="text-paper">starving-crab-42</span>. Your name goes on the
          record only if you put it there yourself.
        </Article>
        <Article
          numeral="IV"
          title="The individual entry is a joke. The aggregate is dead serious."
        >
          One row is a roast. Ten thousand rows are the only public telemetry of how rationed this
          industry actually is.
        </Article>
        <Article numeral="V" title="We are not against the labs.">
          We are their heaviest users; that is how we got this broke. The pressure is real, and so
          is the affection. Neither works alone.
        </Article>
        <Article numeral="VI" title="Resets should be policy, not favors.">
          Right now, relief arrives when a very small number of people decide the complaints have
          gotten loud enough. We want to make that decision easy. Enough of us on the record, and
          generosity stops being a support ticket.
        </Article>
        <Article numeral="VII" title="Intelligence is becoming infrastructure.">
          Rationed infrastructure decides who gets to build. Nobody here is asking for free. We are
          asking for abundant.
        </Article>

        <SectionTitle>where this goes</SectionTitle>
        <p className="mt-5 text-sm leading-relaxed text-dim">
          A reset radar with live countdowns. Drain velocity. Days-since counters that make silence
          legible. A single pane of glass for the question every agent-era developer asks daily:
          what is going on with my tools? We intend to make it accurate enough that the labs end up
          watching it too. That is the endgame: a shared instrument, watched from both sides.
        </p>

        <SectionTitle>sign it</SectionTitle>
        <div className="mt-5 flex flex-col items-start gap-5">
          <p className="text-sm leading-relaxed text-dim">
            This manifest is not signed in ink. It is signed in usage data.
          </p>
          <CopyCommand command={BRAND.cliCommand} />
          <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-2 text-sm text-dim">
            <FlapDigits
              value={movement.devsOnRecord.toLocaleString("en-US")}
              label={`${movement.devsOnRecord.toLocaleString("en-US")} developers have signed`}
              gapClassName="gap-[2px]"
              charClassName="keycap display inline-block min-w-[0.8em] px-1 py-0.5 text-center text-lg font-black tabular-nums"
            />
            <span>developers have signed.</span>
          </p>
          <p className="text-[11px] uppercase tracking-[0.18em] text-faint">
            filed under protest. (affectionately.)
          </p>
        </div>

        <Link
          href="/"
          className="raised mt-16 inline-block px-5 py-3 text-[11px] uppercase tracking-[0.2em] text-dim transition-colors hover:text-paper"
        >
          ← back to the record
        </Link>
      </main>
    </div>
  );
}
