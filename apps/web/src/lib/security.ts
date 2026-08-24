import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function hmacDigest(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function publicDigest(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export function claimCodeDigest(code: string, secret: string): string {
  return hmacDigest(secret, `claim-code\0${code}`);
}

export function claimCodeFor(deviceId: string, createdAt: Date, secret: string): string {
  const bytes = createHmac("sha256", secret)
    .update(`claim-display\0${deviceId}\0${createdAt.toISOString()}`)
    .digest();
  const letters = Array.from(bytes.subarray(0, 4), (value) =>
    String.fromCharCode(65 + (value % 26)),
  ).join("");
  const number = bytes.readUInt32BE(4) % 10_000;
  return `${letters}-${String(number).padStart(4, "0")}`;
}
