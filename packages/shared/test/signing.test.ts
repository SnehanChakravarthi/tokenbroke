import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  deviceIdFor,
  generateDeviceKeyPair,
  signBytes,
  verifyBytes,
} from "../src/node/signing";

describe("Ed25519 signing", () => {
  it("round-trips and rejects a one-byte tamper", () => {
    const keys = generateDeviceKeyPair();
    const body = Buffer.from(canonicalJson({ z: 1, a: { y: 2, x: 3 } }));
    const signature = signBytes(body, keys.privateKey);
    expect(verifyBytes(body, signature, keys.publicKey)).toBe(true);
    const tampered = Buffer.from(body);
    tampered[0] = (tampered[0] ?? 0) ^ 1;
    expect(verifyBytes(tampered, signature, keys.publicKey)).toBe(false);
    expect(deviceIdFor(keys.publicKey)).toHaveLength(22);
  });

  it("sorts object keys while preserving arrays", () => {
    expect(canonicalJson({ z: 1, a: [{ d: 4, c: 3 }] })).toBe('{"a":[{"c":3,"d":4}],"z":1}');
  });
});
