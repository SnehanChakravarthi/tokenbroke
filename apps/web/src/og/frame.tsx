import { BRAND } from "@tokenbroke/shared";
import type { ReactNode } from "react";
import type { OgAssets } from "./assets";

export const OG_SIZE = { width: 1200, height: 630 };

/** The site's midnight palette, restated for satori (no Tailwind in OG land). */
export const INK = {
  paper: "#edf0f8",
  dim: "#a8b2c7",
  muted: "#8592ab",
  faint: "#576480",
  panel: "#171e33",
  line: "#2d3854",
  broke: "#ff6257",
  ok: "#2dd4a0",
  codex: "#7a9dff",
  claude: "#d97757",
} as const;

export function ogFonts(assets: OgAssets) {
  return [
    { name: "Archivo Black", data: assets.archivoBlack, weight: 400 as const },
    { name: "Plex Mono", data: assets.plexMono, weight: 400 as const },
    { name: "Plex Mono", data: assets.plexMonoSemiBold, weight: 600 as const },
  ];
}

/** Midnight gradient stage with the domain footer; children stack centered. */
export function Frame({ children, footer }: { children: ReactNode; footer?: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(180deg, #141b36 0%, #0c101f 55%, #0b0e1a 100%)",
        color: INK.paper,
        fontFamily: "Plex Mono",
        position: "relative",
      }}
    >
      {children}
      <div
        style={{
          position: "absolute",
          bottom: 34,
          display: "flex",
          fontSize: 24,
          color: INK.faint,
        }}
      >
        {footer ?? `${BRAND.domain} · ${BRAND.cliCommand}`}
      </div>
    </div>
  );
}

export function Pill({ children, color }: { children: ReactNode; color: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        border: `1.5px solid ${INK.line}`,
        backgroundColor: INK.panel,
        borderRadius: 999,
        padding: "10px 22px",
        fontSize: 21,
        color,
      }}
    >
      {children}
    </div>
  );
}
