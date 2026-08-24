import { handleAdminReset } from "@/src/lib/resets";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleAdminReset(request);
}
