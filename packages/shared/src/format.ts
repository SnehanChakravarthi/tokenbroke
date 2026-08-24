const ORDINAL_SUFFIXES = ["th", "st", "nd", "rd"] as const;

/** English ordinal for a whole number: 1st, 2nd, 3rd, 4th, 11th, 21st, 101st, 111th. */
export function ordinal(n: number): string {
  const value = Math.trunc(n);
  const magnitude = Math.abs(value);
  const teens = magnitude % 100;
  const suffix = teens >= 11 && teens <= 13 ? "th" : (ORDINAL_SUFFIXES[magnitude % 10] ?? "th");
  return `${value}${suffix}`;
}
