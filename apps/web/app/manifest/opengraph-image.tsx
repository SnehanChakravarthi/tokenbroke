import { BRAND } from "@tokenbroke/shared";
import { ImageResponse } from "next/og";
import { siteDatabase } from "@/src/lib/dev-db";
import { movementStats } from "@/src/lib/movement";
import { loadOgAssets } from "@/src/og/assets";
import { Frame, INK, OG_SIZE, ogFonts } from "@/src/og/frame";

export const dynamic = "force-dynamic";
export const alt = `the ${BRAND.name} manifest`;
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function OpengraphImage() {
  const assets = await loadOgAssets();
  let signed: number | null = null;
  try {
    const database = await siteDatabase();
    signed = (await movementStats(database)).devsOnRecord;
  } catch {
    // The declaration stands even when the tally is unavailable.
  }
  return new ImageResponse(
    <Frame footer={`sign it: ${BRAND.cliCommand}`}>
      {/* biome-ignore lint/performance/noImgElement: satori renders plain img tags */}
      <img
        src={assets.wordmark}
        width={560}
        height={81}
        alt=""
        style={{ transform: "rotate(-3deg)", marginBottom: 40 }}
      />
      <div
        style={{
          display: "flex",
          fontFamily: "Archivo Black",
          fontSize: 54,
          color: INK.paper,
          letterSpacing: -1,
        }}
      >
        THE MANIFEST
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 18,
          fontSize: 26,
          color: INK.dim,
          fontStyle: "italic",
        }}
      >
        signed in usage data, not ink.
      </div>
      {signed !== null && (
        <div style={{ display: "flex", gap: 14, marginTop: 34, fontSize: 30, color: INK.muted }}>
          <span style={{ fontFamily: "Archivo Black", color: INK.paper }}>
            {signed.toLocaleString("en-US")}
          </span>
          <span>developers have signed.</span>
        </div>
      )}
    </Frame>,
    { ...OG_SIZE, fonts: ogFonts(assets) },
  );
}
