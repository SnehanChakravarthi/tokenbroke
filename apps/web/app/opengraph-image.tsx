import { BRAND } from "@tokenbroke/shared";
import { ImageResponse } from "next/og";
import { siteDatabase } from "@/src/lib/dev-db";
import { getPublicLeaderboard } from "@/src/lib/leaderboard";
import { movementStats } from "@/src/lib/movement";
import { loadOgAssets } from "@/src/og/assets";
import { Frame, INK, OG_SIZE, ogFonts, Pill } from "@/src/og/frame";

export const dynamic = "force-dynamic";
export const alt = `${BRAND.name} — the public leaderboard of rate-limited developers`;
export const size = OG_SIZE;
export const contentType = "image/png";

function labLine(name: string, median: number | null, days: number | null): string {
  const left = median === null ? "—" : `${Math.round(median * 10) / 10}% left`;
  const reset = days === null ? "no reset yet" : days === 0 ? "reset today" : `reset ${days}d ago`;
  return `${name} · ${left} · ${reset}`;
}

export default async function OpengraphImage() {
  const assets = await loadOgAssets();
  let devs: number | null = null;
  let codexLine = "Codex · the record is live";
  let claudeLine = "Claude Code · the record is live";
  try {
    const now = new Date();
    const database = await siteDatabase();
    const [codex, claude, movement] = await Promise.all([
      getPublicLeaderboard("codex", { now, database }),
      getPublicLeaderboard("claude-code", { now, database }),
      movementStats(database),
    ]);
    devs = movement.devsOnRecord;
    codexLine = labLine("Codex", codex.global.medianRemainingPercent, codex.global.daysSinceReset);
    claudeLine = labLine(
      "Claude Code",
      claude.global.medianRemainingPercent,
      claude.global.daysSinceReset,
    );
  } catch {
    // A stats hiccup must never break the share card; the static parts still sell it.
  }
  return new ImageResponse(
    <Frame>
      <div
        style={{
          display: "flex",
          fontFamily: "Archivo Black",
          fontSize: 52,
          letterSpacing: -1,
          marginBottom: -4,
        }}
      >
        ARE YOU
      </div>
      {/* biome-ignore lint/performance/noImgElement: satori renders plain img tags */}
      <img
        src={assets.wordmark}
        width={900}
        height={130}
        alt=""
        style={{ transform: "rotate(-3.5deg)" }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 18,
          marginTop: 26,
          fontSize: 40,
          color: INK.dim,
        }}
      >
        {devs !== null && (
          <span style={{ fontFamily: "Archivo Black", fontSize: 58, color: INK.paper }}>
            {devs.toLocaleString("en-US")}
          </span>
        )}
        <span>{devs === null ? "the record is live." : "of us are."}</span>
      </div>
      <div style={{ display: "flex", gap: 20, marginTop: 34 }}>
        <Pill color={INK.codex}>{codexLine}</Pill>
        <Pill color={INK.claude}>{claudeLine}</Pill>
      </div>
    </Frame>,
    { ...OG_SIZE, fonts: ogFonts(assets) },
  );
}
