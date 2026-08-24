import type { ToolId } from "@tokenbroke/shared";
import { getPublicLeaderboard } from "@/src/lib/leaderboard";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const tool = new URL(request.url).searchParams.get("tool");
  if (tool !== "claude-code" && tool !== "codex") {
    return Response.json({ ok: false, reason: "invalid" }, { status: 400 });
  }
  const result = await getPublicLeaderboard(tool as ToolId);
  return Response.json(
    { ok: true, ...result },
    { headers: { "cache-control": "public, max-age=30" } },
  );
}
