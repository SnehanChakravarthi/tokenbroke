export { BRAND, claimUrl } from "./brand";
export type {
  LeaderboardRow,
  SubmissionFailureV1,
  SubmissionResponseV1,
  SubmissionSuccessV1,
  SubmissionV1,
} from "./contract/v1";
export {
  API_PATH_V1,
  SCHEMA_VERSION,
} from "./contract/v1";
export { ordinal } from "./format";
export {
  ANONYMOUS_NAME_PATTERN,
  generateAnonymousName,
  NAME_ADJECTIVES,
  NAME_NOUNS,
} from "./names";
export type {
  DrainSample,
  InstallStatus,
  LocalReadings,
  ObservationStatus,
  PlanInfo,
  ReaderWarning,
  ToolId,
  ToolReading,
  UsageSeriesKey,
  UsageWindow,
} from "./readings";
export { seriesId } from "./readings";
export type { AggregateReading } from "./scoring/aggregates";
export {
  blockedHoursRemaining,
  brokeFraction,
  devs,
  medianRemainingPercent,
} from "./scoring/aggregates";
export type { FreshnessState } from "./scoring/freshness";
export { freshnessState } from "./scoring/freshness";
export type { DevMisery, ToolMisery } from "./scoring/misery";
export {
  DEPLETION_EXPONENT,
  DEPLETION_FLOOR,
  depletion,
  devMisery,
  toolMisery,
  windowMisery,
} from "./scoring/misery";
export type { ComparableRow } from "./scoring/rank";
export { compareRows, stableDeviceHash } from "./scoring/rank";
export type {
  ClassifiedWindow,
  DurationBand,
  WindowRole,
  WindowRule,
} from "./scoring/registry";
export {
  classify,
  durationBandFor,
  REGISTRY_V1,
  REGISTRY_VERSION,
  validateRegistry,
} from "./scoring/registry";
