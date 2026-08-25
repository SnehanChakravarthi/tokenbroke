import { BRAND, type LeaderboardRow, ordinal } from "@tokenbroke/shared";
import { ImageResponse } from "next/og";
import { siteDatabase } from "@/src/lib/dev-db";
import { getPublicLeaderboard, type PublicLeaderboardV1 } from "@/src/lib/leaderboard";
import { loadOgAssets } from "@/src/og/assets";
import { Frame, INK, OG_SIZE, ogFonts } from "@/src/og/frame";

export const dynamic = "force-dynamic";
export const alt = `a developer's standing on ${BRAND.domain}`;
export const size = OG_SIZE;
export const contentType = "image/png";

const TOOL_META = {
  codex: { title: "Codex", color: INK.codex },
  "claude-code": { title: "Claude Code", color: INK.claude },
} as const;

function findRow(board: PublicLeaderboardV1, name: string): LeaderboardRow | null {
  const needle = name.toLowerCase();
  return board.rows.find((row) => row.name.toLowerCase() === needle) ?? null;
}

export default async function OpengraphImage({ params }: { params: Promise<{ name: string }> }) {
  const { name: rawName } = await params;
  const name = decodeURIComponent(rawName).slice(0, 60);
  const assets = await loadOgAssets();
  let entries: Array<{ board: PublicLeaderboardV1; row: LeaderboardRow }> = [];
  try {
    const now = new Date();
    const database = await siteDatabase();
    const boards = await Promise.all([
      getPublicLeaderboard("codex", { now, database }),
      getPublicLeaderboard("claude-code", { now, database }),
    ]);
    entries = boards
      .map((board) => ({ board, row: findRow(board, name) }))
      .filter(
        (entry): entry is { board: PublicLeaderboardV1; row: LeaderboardRow } => entry.row !== null,
      );
  } catch {
    // Render the nameplate even if stats are unavailable.
  }
  const bestRank = entries.length ? Math.min(...entries.map(({ row }) => row.rank)) : null;

  return new ImageResponse(
    <Frame footer={`claim yours: ${BRAND.cliCommand}`}>
      {/* biome-ignore lint/performance/noImgElement: satori renders plain img tags */}
      <img
        src={assets.wordmark}
        width={440}
        height={64}
        alt=""
        style={{ transform: "rotate(-3deg)", marginBottom: 32 }}
      />
      <div
        style={{
          display: "flex",
          fontFamily: "Archivo Black",
          fontSize: name.length > 18 ? 52 : 68,
          color: INK.paper,
          marginBottom: 12,
        }}
      >
        {name}
      </div>
      <div style={{ display: "flex", fontSize: 26, color: INK.muted, letterSpacing: 4 }}>
        {entries.length ? "ON THE RECORD" : "NO FRESH READING ON RECORD"}
      </div>
      {bestRank !== null && (
        <div style={{ display: "flex", gap: 12, marginTop: 24, fontSize: 30, color: INK.dim }}>
          <span>the</span>
          <span style={{ color: INK.broke, fontWeight: 600 }}>{ordinal(bestRank)}</span>
          <span>brokest developer alive.</span>
        </div>
      )}
      <div style={{ display: "flex", gap: 22, marginTop: 32 }}>
        {entries.map(({ board, row }) => {
          const meta = TOOL_META[board.tool];
          return (
            <div
              key={board.tool}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                border: `1.5px solid ${INK.line}`,
                backgroundColor: INK.panel,
                borderRadius: 20,
                padding: "22px 40px",
              }}
            >
              <div style={{ display: "flex", fontSize: 24, color: meta.color }}>{meta.title}</div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 12,
                  fontFamily: "Archivo Black",
                  fontSize: 46,
                  color: INK.paper,
                }}
              >
                #{row.rank}
                <span style={{ fontFamily: "Plex Mono", fontSize: 22, color: INK.faint }}>
                  of {board.rows.length}
                </span>
              </div>
              <div style={{ display: "flex", fontSize: 22, color: INK.dim }}>
                {Math.round(row.remainingPercent * 10) / 10}% left
              </div>
            </div>
          );
        })}
      </div>
    </Frame>,
    { ...OG_SIZE, fonts: ogFonts(assets) },
  );
}
