export {
  logApiGatewayEvent,
  logApiGatewayEventV2,
  logSqsEvent,
  logSnsEvent,
  logEventBridgeEvent,
  logS3Event,
  logDynamoDBStreamEvent,
  logAppSyncEvent,
} from './logLambdaEvent';

export type { LogConfig } from './logLambdaEvent';

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
} from './logger';

export type { Logger, LogLevel, LogLevelLabel, LogSink, ErrorLog } from './logger';

// Per-invocation log buffer: keeps DEBUG/INFO out of CloudWatch on a successful
// invocation and releases the whole buffer as context when the invocation fails or is
// about to time out. Backed by `node:async_hooks` (a Node builtin, not an optional peer).
export {
  withRuntimeLogCollector,
  addTrackingKey,
  DEFAULT_PRE_TIMEOUT_MARGIN_MS,
  TRACKING_LOG_MESSAGE,
} from './runtime-log-collector';

export type {
  ReleaseLevel,
  TrackingKeyOptions,
  RuntimeLogCollectorOptions,
  CollectableHandler,
  CollectedHandler,
} from './runtime-log-collector';
