import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";

export interface DeviceKeyPair {
  privateKey: string;
  publicKey: string;
}

export function generateDeviceKeyPair(): DeviceKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64url"),
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64url"),
  };
}

export function deviceIdFor(publicKey: string): string {
  return createHash("sha256")
    .update(Buffer.from(publicKey, "base64url"))
    .digest()
    .subarray(0, 16)
    .toString("base64url");
}

export function signBytes(bytes: Uint8Array, privateKey: string): string {
  const key = createPrivateKey({
    key: Buffer.from(privateKey, "base64url"),
    type: "pkcs8",
    format: "der",
  });
  return sign(null, bytes, key).toString("base64url");
}

export function verifyBytes(bytes: Uint8Array, signature: string, publicKey: string): boolean {
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKey, "base64url"),
      type: "spki",
      format: "der",
    });
    return verify(null, bytes, key, Buffer.from(signature, "base64url"));
  } catch {
    return false;
  }
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sortValue(item));
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) sorted[key] = sortValue(item);
    }
    return sorted;
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}
