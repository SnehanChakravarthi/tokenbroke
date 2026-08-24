import { type ReaderTiming, readAll } from "../src/readers";

const DEFAULT_RUNS = 10;

function runCount(value: string | undefined): number {
  const parsed = value === undefined ? DEFAULT_RUNS : Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
    throw new Error("N must be an integer from 1 to 1000");
  }
  return parsed;
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(fraction * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

function keyOf(timing: ReaderTiming): string {
  return `${timing.tool} ${timing.phase}`;
}

const runs = runCount(process.argv[2]);
const samples = new Map<string, number[]>();

for (let index = 0; index < runs; index += 1) {
  await readAll({
    onTiming(timing): void {
      const key = keyOf(timing);
      const values = samples.get(key) ?? [];
      values.push(timing.durationMs);
      samples.set(key, values);
    },
  });
}

console.log(`tokenbroke local-reader benchmark (${runs} runs)`);
for (const [key, values] of [...samples].sort(([left], [right]) => left.localeCompare(right))) {
  const p50 = percentile(values, 0.5).toFixed(1);
  const p95 = percentile(values, 0.95).toFixed(1);
  console.log(`${key.padEnd(27)} p50 ${p50.padStart(7)} ms  p95 ${p95.padStart(7)} ms`);
}
