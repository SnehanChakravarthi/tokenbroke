import { handleClaimStart } from "@/src/lib/claim";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleClaimStart(request);
}
