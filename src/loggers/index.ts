export {
  logApiGatewayEvent,
  logSqsEvent,
  logSnsEvent,
  logEventBridgeEvent,
  logS3Event,
  logDynamoDBStreamEvent,
} from './logLambdaEvent';

export type { LogConfig } from './logLambdaEvent';
