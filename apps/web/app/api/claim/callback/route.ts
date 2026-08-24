import { handleClaimCallback } from "@/src/lib/claim";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleClaimCallback(request);
}
