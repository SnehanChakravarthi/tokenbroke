import type { FileSystemAccess, SafeFileHandle } from "./access";

export interface JsonlReadResult<T> {
  items: T[];
  malformedLines: number;
  timedOut: boolean;
}

export interface JsonlReadOptions {
  shouldStop?: () => boolean;
  chunkBytes?: number;
}

const DEFAULT_CHUNK_BYTES = 64 * 1024;

function extractLine<T>(
  line: string,
  extractor: (value: unknown) => T | null,
): T | null | undefined {
  if (line.trim().length === 0) return null;
  try {
    const value: unknown = JSON.parse(line);
    return extractor(value);
  } catch {
    return undefined;
  }
}

async function closeQuietly(handle: SafeFileHandle): Promise<void> {
  try {
    await handle.close();
  } catch {
    // The read result is already determined; never surface a path-bearing close error.
  }
}

export async function readJsonlTail<T>(
  access: FileSystemAccess,
  path: string,
  maxBytes: number,
  extractor: (value: unknown) => T | null,
): Promise<JsonlReadResult<T>> {
  const handle = await access.openFile(path);
  try {
    const start = Math.max(0, handle.size - maxBytes);
    const bytes = await handle.read(start, handle.size - start);
    let text = new TextDecoder().decode(bytes);
    if (start > 0) {
      const firstNewline = text.indexOf("\n");
      text = firstNewline === -1 ? "" : text.slice(firstNewline + 1);
    }
    const items: T[] = [];
    let malformedLines = 0;
    for (const line of text.split("\n")) {
      const item = extractLine(line.replace(/\r$/, ""), extractor);
      if (item === undefined) malformedLines += 1;
      else if (item !== null) items.push(item);
    }
    return { items, malformedLines, timedOut: false };
  } finally {
    await closeQuietly(handle);
  }
}

export async function streamJsonl<T>(
  access: FileSystemAccess,
  path: string,
  extractor: (value: unknown) => T | null,
  options: JsonlReadOptions = {},
): Promise<JsonlReadResult<T>> {
  const handle = await access.openFile(path);
  const items: T[] = [];
  let malformedLines = 0;
  let pending = "";
  let position = 0;
  let timedOut = false;
  const decoder = new TextDecoder();
  const chunkBytes = options.chunkBytes ?? DEFAULT_CHUNK_BYTES;

  try {
    while (position < handle.size) {
      if (options.shouldStop?.()) {
        timedOut = true;
        break;
      }
      const bytes = await handle.read(position, Math.min(chunkBytes, handle.size - position));
      if (bytes.byteLength === 0) break;
      position += bytes.byteLength;
      pending += decoder.decode(bytes, { stream: position < handle.size });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const item = extractLine(line.replace(/\r$/, ""), extractor);
        if (item === undefined) malformedLines += 1;
        else if (item !== null) items.push(item);
      }
    }

    if (!timedOut && pending.length > 0) {
      const item = extractLine(pending.replace(/\r$/, ""), extractor);
      if (item === undefined) malformedLines += 1;
      else if (item !== null) items.push(item);
    }
    return { items, malformedLines, timedOut };
  } finally {
    await closeQuietly(handle);
  }
}
