export {
  logApiGatewayEvent,
  logApiGatewayEventV2,
  logSqsEvent,
  logSnsEvent,
  logEventBridgeEvent,
  logS3Event,
  logDynamoDBStreamEvent,
  logAppSyncEvent,
} from './logLambdaEvent.js';

export type { LogConfig } from './logLambdaEvent.js';

// Pluggable structured logger: the package writes through `getLogger()`, and
// applications may replace the implementation (pino, winston, ...) with
// `setLogger()` or only redirect the already serialized line with `setLogSink()`.
export {
  defaultLogger,
  setLogger,
  getLogger,
  resetLogger,
  setLogSink,
  resetLogSink,
  toErrorLog,
} from './logger.js';

// Level gate: DEBUG is dropped unless asked for, locally as well as in Lambda. Filtering
// used to be delegated entirely to Advanced Logging Controls, which never saw the records
// as DEBUG in the first place — they carried no timestamp, so the platform relabelled them.
export { setLogLevel, getLogLevel, resetLogLevel, DEFAULT_LOG_LEVEL } from './logger.js';

// Redaction by key name, applied to the default logger while it serializes.
export {
  setRedactKeys,
  addRedactKeys,
  getRedactKeys,
  resetRedactKeys,
  DEFAULT_REDACT_KEYS,
} from './logger.js';

export type { Logger, LogLevel, LogLevelLabel, LogSink, ErrorLog } from './logger.js';

// Per-invocation log buffer: keeps DEBUG/INFO out of CloudWatch on a successful
// invocation and releases the whole buffer as context when the invocation fails or is
// about to time out. Backed by `node:async_hooks` (a Node builtin, not an optional peer).
export {
  withRuntimeLogCollector,
  addTrackingKey,
  DEFAULT_PRE_TIMEOUT_MARGIN_MS,
  DEFAULT_MAX_BUFFERED_LINES,
  TRACKING_LOG_MESSAGE,
} from './runtime-log-collector.js';

export type {
  ReleaseLevel,
  TrackingKeyOptions,
  RuntimeLogCollectorOptions,
  CollectableHandler,
  CollectedHandler,
} from './runtime-log-collector.js';
