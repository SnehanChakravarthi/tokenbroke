import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  type AggregateReading,
  API_PATH_V1,
  devs as aggregateDevs,
  claimUrl,
  compareRows,
  freshnessState,
  generateAnonymousName,
  type LeaderboardRow,
  type LocalReadings,
  medianRemainingPercent,
  ordinal,
  SCHEMA_VERSION,
  type SubmissionFailureV1,
  type SubmissionSuccessV1,
  type SubmissionV1,
  type ToolId,
  type ToolReading,
  toolMisery,
} from "@tokenbroke/shared";
import { deviceIdFor, verifyBytes } from "@tokenbroke/shared/node/signing";

interface StoredDevice {
  deviceId: string;
  name: string;
  readings: LocalReadings;
}

export interface StubServer {
  url: string;
  submissions: SubmissionV1[];
  close: () => Promise<void>;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function fixtureReading(
  reading: ToolReading,
  usedPercent: number,
  hours: number,
  now: Date,
): ToolReading {
  return {
    ...reading,
    observedAt: now.toISOString(),
    sourceFetchedAt: now.toISOString(),
    windows: reading.windows.map((window, index) => ({
      ...window,
      usedPercent: Math.max(0, Math.min(100, usedPercent - index * 4)),
      resetsAt: new Date(now.getTime() + hours * 3_600_000).toISOString(),
    })),
  };
}

function fixtureDevices(readings: LocalReadings, now: Date): StoredDevice[] {
  return [
    [99, 120],
    [96, 72],
    [92, 48],
    [85, 24],
    [75, 12],
  ].map(([used, hours], index) => ({
    deviceId: `fixture-${index + 1}`,
    name: generateAnonymousName(seededRandom(index + 1)),
    readings: readings.map((reading) =>
      fixtureReading(reading, used ?? 0, hours ?? 1, now),
    ) as LocalReadings,
  }));
}

function remainingRow(
  rank: number,
  device: StoredDevice,
  reading: ToolReading,
  now: Date,
  userDeviceId: string,
): LeaderboardRow {
  const binding = toolMisery(reading, now).bindingWindow;
  return {
    rank,
    name: device.name,
    claimed: false,
    avatarUrl: null,
    plan: reading.plan.label,
    remainingPercent: binding ? 100 - binding.usedPercent : 100,
    resetsAt: binding?.resetsAt ?? null,
    isYou: device.deviceId === userDeviceId,
  };
}

function perToolResponse(
  tool: ToolId,
  devices: StoredDevice[],
  user: StoredDevice,
  now: Date,
): SubmissionSuccessV1["perTool"][number] {
  const ranked = devices
    .map((device) => {
      const reading = device.readings.find((item) => item.tool === tool);
      if (!reading) return null;
      const score = toolMisery(reading, now);
      if (freshnessState(reading, now) !== "fresh" || score.misery === null) return null;
      return {
        device,
        reading,
        misery: score.misery,
        observedAt: reading.observedAt ?? "",
        deviceId: device.deviceId,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort(compareRows);
  const userIndex = ranked.findIndex((row) => row.device.deviceId === user.deviceId);
  const rows = ranked.map((row, index) =>
    remainingRow(index + 1, row.device, row.reading, now, user.deviceId),
  );
  const neighbors = userIndex < 0 ? [] : rows.slice(Math.max(0, userIndex - 3), userIndex + 4);
  const neighborKeys = new Set(neighbors.map((row) => `${row.rank}:${row.name}`));
  const top = rows.slice(0, 3).filter((row) => !neighborKeys.has(`${row.rank}:${row.name}`));
  const userScore = userIndex < 0 ? null : ranked[userIndex];
  return {
    tool,
    rankable: userIndex >= 0,
    rank: userIndex >= 0 ? userIndex + 1 : null,
    total: ranked.length,
    misery: userScore?.misery ?? null,
    bindingSeriesId: userScore ? toolMisery(userScore.reading, now).bindingSeriesId : null,
    top,
    neighbors,
    roast:
      userIndex >= 0
        ? `You are the ${ordinal(userIndex + 1)} brokest developer alive. Charity declined.`
        : "No sentence on record.",
  };
}

async function requestBytes(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 2 * 1024 * 1024) throw new Error("request too large");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

const EXPECTED_TOOLS: readonly ToolId[] = ["claude-code", "codex"];

/**
 * The readings tuple is the only part of a submission we index into positionally. Prove its shape
 * before anything touches it, so a hostile payload is a plain `invalid` and never a thrown
 * TypeError swallowed into a generic 400.
 */
function validReadings(value: unknown): value is LocalReadings {
  if (!Array.isArray(value) || value.length !== EXPECTED_TOOLS.length) return false;
  return EXPECTED_TOOLS.every((tool, index) => {
    const reading: unknown = value[index];
    if (typeof reading !== "object" || reading === null) return false;
    const item = reading as Partial<ToolReading>;
    return item.tool === tool && Array.isArray(item.windows);
  });
}

function failure(reason: SubmissionFailureV1["reason"]): SubmissionFailureV1 {
  return { ok: false, reason, notice: reason };
}

function send(response: ServerResponse, body: SubmissionSuccessV1 | SubmissionFailureV1): void {
  response.writeHead(body.ok ? 200 : 400, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

export async function startStubServer(): Promise<StubServer> {
  const nonces = new Set<string>();
  const devices = new Map<string, StoredDevice>();
  const names = new Map<string, string>();
  const submissions: SubmissionV1[] = [];
  let fixtures: StoredDevice[] = [];
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== API_PATH_V1) {
      response.writeHead(404).end();
      return;
    }
    try {
      const raw = await requestBytes(request);
      let payload: SubmissionV1;
      try {
        payload = JSON.parse(raw.toString("utf8")) as SubmissionV1;
      } catch {
        send(response, failure("invalid"));
        return;
      }
      if (payload.schemaVersion !== SCHEMA_VERSION) {
        send(response, failure("unsupported-version"));
        return;
      }
      const header = request.headers["x-tokenbroke-signature"];
      const signature =
        typeof header === "string" && header.startsWith("ed25519=")
          ? header.slice("ed25519=".length)
          : "";
      if (
        deviceIdFor(payload.publicKey) !== payload.deviceId ||
        !verifyBytes(raw, signature, payload.publicKey)
      ) {
        send(response, failure("signature"));
        return;
      }
      if (!validReadings(payload.readings)) {
        send(response, failure("invalid"));
        return;
      }
      const now = new Date();
      const submittedAt =
        typeof payload.submittedAt === "string" ? Date.parse(payload.submittedAt) : Number.NaN;
      if (!Number.isFinite(submittedAt) || Math.abs(now.getTime() - submittedAt) > 600_000) {
        send(response, failure("skew"));
        return;
      }
      if (nonces.has(payload.nonce)) {
        send(response, failure("replay"));
        return;
      }
      nonces.add(payload.nonce);
      submissions.push(payload);
      fixtures = fixtures.length === 0 ? fixtureDevices(payload.readings, now) : fixtures;
      const name =
        names.get(payload.deviceId) ?? generateAnonymousName(seededRandom(names.size + 101));
      names.set(payload.deviceId, name);
      const user = { deviceId: payload.deviceId, name, readings: payload.readings };
      devices.set(payload.deviceId, user);
      const all = [...fixtures, ...devices.values()];
      const perTool = (["claude-code", "codex"] as const).map((tool) =>
        perToolResponse(tool, all, user, now),
      );
      const aggregateRows = (tool: ToolId): AggregateReading[] =>
        all.map((device) => ({
          deviceId: device.deviceId,
          reading: device.readings.find((reading) => reading.tool === tool) as ToolReading,
        }));
      const globalPerTool = perTool.map((result) => {
        const rows = aggregateRows(result.tool);
        const userReading = user.readings.find(
          (reading) => reading.tool === result.tool,
        ) as ToolReading;
        const binding = toolMisery(userReading, now).bindingSeriesId;
        return {
          tool: result.tool,
          medianRemainingPercent: binding ? medianRemainingPercent(rows, binding, now) : null,
          daysSinceReset: null,
        };
      });
      const allRows = (["claude-code", "codex"] as const).flatMap(aggregateRows);
      const claimCode = `TBOK-${String(names.size).padStart(4, "0")}`;
      send(response, {
        ok: true,
        schemaVersion: SCHEMA_VERSION,
        identity: { deviceId: user.deviceId, anonymousName: name, claimed: null },
        claim: {
          code: claimCode,
          url: claimUrl(claimCode),
          expiresAt: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
        },
        perTool,
        global: { devs: aggregateDevs(allRows, now), perTool: globalPerTool },
        notices: [],
      });
    } catch {
      send(response, failure("invalid"));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (typeof address === "string" || address === null) throw new Error("stub failed to listen");
  return {
    url: `http://127.0.0.1:${address.port}`,
    submissions,
    close: async () => {
      server.close();
      await once(server, "close");
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const stub = await startStubServer();
  console.log(stub.url);
}
