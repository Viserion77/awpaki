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
