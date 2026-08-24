import { handleSubmission } from "@/src/lib/submissions";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleSubmission(request);
}
