export {
  logApiGatewayEvent,
  logSqsEvent,
  logSnsEvent,
  logEventBridgeEvent,
  logS3Event,
  logDynamoDBStreamEvent,
  logAppSyncEvent,
} from './logLambdaEvent';

export type { LogConfig } from './logLambdaEvent';
