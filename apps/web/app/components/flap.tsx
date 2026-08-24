"use client";

import { useEffect, useState } from "react";

const WHEEL = "0123456789";

/**
 * Split-flap digits, airport-departure-board style: characters spin and settle
 * left to right. Non-digits render as-is; reduced motion settles instantly.
 */
export function FlapDigits({
  value,
  charClassName,
  gapClassName = "gap-[2px]",
  label,
}: {
  value: string;
  charClassName: string;
  gapClassName?: string;
  label?: string;
}) {
  const [shown, setShown] = useState(() => value.replace(/[0-9]/g, "0"));
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const elapsed = now - startedAt;
      let settled = true;
      const next = value
        .split("")
        .map((char, index) => {
          if (!/[0-9]/.test(char)) return char;
          const settleAt = 420 + index * 150;
          if (elapsed >= settleAt) return char;
          settled = false;
          return WHEEL[Math.floor(elapsed / 52 + index * 3) % 10];
        })
        .join("");
      setShown(next);
      if (!settled) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // rAF is throttled to nothing in background tabs; guarantee the real value regardless.
    const failsafe = setTimeout(
      () => {
        cancelAnimationFrame(frame);
        setShown(value);
      },
      420 + value.length * 150 + 450,
    );
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(failsafe);
    };
  }, [value]);

  return (
    <span className={`inline-flex ${gapClassName}`} role="img" aria-label={label ?? value}>
      {shown.split("").map((char, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: positional digit strip
          key={index}
          className={`flap relative ${charClassName} ${/[0-9]/.test(value[index] ?? "") ? "" : "flap-plain"}`}
          aria-hidden
        >
          {char}
        </span>
      ))}
    </span>
  );
}
