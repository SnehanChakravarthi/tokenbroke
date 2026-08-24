import type { ToolId } from "@tokenbroke/shared";
import { type Database, getDatabase } from "./db";
import { invalidateLeaderboardCache } from "./leaderboard";
import { constantTimeEqual } from "./security";

function date(value: unknown): Date | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? new Date(epoch) : null;
}

export async function handleAdminReset(
  request: Request,
  options: { database?: Database; adminToken?: string } = {},
): Promise<Response> {
  const expected = options.adminToken ?? process.env.ADMIN_TOKEN;
  if (!expected) return Response.json({ ok: false }, { status: 503 });
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!constantTimeEqual(supplied, expected)) return Response.json({ ok: false }, { status: 401 });
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > 16_384) {
    return Response.json({ ok: false }, { status: 400 });
  }
  let value: unknown;
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > 16_384) return Response.json({ ok: false }, { status: 400 });
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return Response.json({ ok: false }, { status: 400 });
  }
  const field = (key: string): unknown => Object.getOwnPropertyDescriptor(value, key)?.value;
  const tool = field("tool");
  const landedAt = date(field("landedAt"));
  const announced = field("announcedAt");
  const announcedAt = announced === null || announced === undefined ? null : date(announced);
  const note = field("note");
  if (
    (tool !== "claude-code" && tool !== "codex") ||
    landedAt === null ||
    (announced !== null && announced !== undefined && announcedAt === null) ||
    !(note === null || note === undefined || (typeof note === "string" && note.length <= 1_000))
  ) {
    return Response.json({ ok: false }, { status: 400 });
  }
  const database = options.database ?? getDatabase();
  const inserted = await database.query<{ id: number }>(
    `insert into resets (tool, announced_at, landed_at, source, note)
     values ($1, $2, $3, 'admin', $4) returning id`,
    [tool, announcedAt, landedAt, note ?? null],
  );
  invalidateLeaderboardCache(tool as ToolId);
  return Response.json({ ok: true, id: inserted.rows[0]?.id }, { status: 201 });
}
