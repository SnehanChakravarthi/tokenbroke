// Dev-only: print this machine's local readings. Drain series are summarized unless --full is passed,
// because 2,000 samples pretty-printed is not something a human reads in a terminal.
import { readAll } from "../src/readers";

const full = process.argv.includes("--full");
const readings = await readAll();
const printable = full
  ? readings
  : readings.map((reading) => ({
      ...reading,
      drain: {
        samples: reading.drain.length,
        first: reading.drain.at(0)?.at ?? null,
        last: reading.drain.at(-1)?.at ?? null,
        series: [...new Set(reading.drain.map((sample) => sample.seriesId))],
      },
    }));
console.log(JSON.stringify(printable, null, 2));
