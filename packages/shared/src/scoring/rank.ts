export interface ComparableRow {
  misery: number;
  observedAt: string;
  deviceId: string;
}

/** Small deterministic browser-safe hash for a stable, non-semantic tie-break. */
export function stableDeviceHash(deviceId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < deviceId.length; index++) {
    hash ^= deviceId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Misery first, then the newer observation, then a stable hash of the device id.
 * An unparseable `observedAt` on either side skips the recency step entirely, so rows with
 * garbage timestamps still land in a total, input-order-independent order.
 */
export function compareRows(left: ComparableRow, right: ComparableRow): number {
  if (left.misery !== right.misery) return right.misery - left.misery;
  const leftObserved = Date.parse(left.observedAt);
  const rightObserved = Date.parse(right.observedAt);
  if (Number.isFinite(leftObserved) && Number.isFinite(rightObserved)) {
    const observed = rightObserved - leftObserved;
    if (observed !== 0) return observed;
  }
  const hash = stableDeviceHash(left.deviceId) - stableDeviceHash(right.deviceId);
  return hash !== 0 ? hash : left.deviceId.localeCompare(right.deviceId);
}
