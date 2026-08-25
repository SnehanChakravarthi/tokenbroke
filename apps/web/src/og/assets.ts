import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Resolve bundled files in both runtimes: locally cwd is apps/web; on Vercel the
 * traced monorepo bundle may root at the repo, leaving files under apps/web/.
 */
async function readBundled(relative: string): Promise<Buffer> {
  const candidates = [
    path.join(process.cwd(), relative),
    path.join(process.cwd(), "apps/web", relative),
  ];
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return await readFile(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`asset not found: ${relative}`);
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

export interface OgAssets {
  archivoBlack: ArrayBuffer;
  plexMono: ArrayBuffer;
  plexMonoSemiBold: ArrayBuffer;
  /** The 3D wordmark as a data URI (1600x231). */
  wordmark: string;
}

export async function loadOgAssets(): Promise<OgAssets> {
  const [archivoBlack, plexMono, plexMonoSemiBold, wordmarkPng] = await Promise.all([
    readBundled("src/og/fonts/ArchivoBlack-Regular.ttf"),
    readBundled("src/og/fonts/IBMPlexMono-Regular.ttf"),
    readBundled("src/og/fonts/IBMPlexMono-SemiBold.ttf"),
    readBundled("public/tokenbroke-3d.png"),
  ]);
  return {
    archivoBlack: toArrayBuffer(archivoBlack),
    plexMono: toArrayBuffer(plexMono),
    plexMonoSemiBold: toArrayBuffer(plexMonoSemiBold),
    wordmark: `data:image/png;base64,${wordmarkPng.toString("base64")}`,
  };
}
