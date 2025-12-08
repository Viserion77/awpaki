import { 
  APIGatewayProxyEvent, 
  SQSEvent, 
  SNSEvent, 
  EventBridgeEvent,
  S3Event,
  DynamoDBStreamEvent,
  Context 
} from 'aws-lambda';

/**
 * Log levels for Lambda event logging
 */
export enum LogLevel {
  NONE = 'none',
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

/**
 * Configuration for Lambda event logging
 */
export interface LogConfig {
  /** Log level from environment variable (default: LOG_LEVEL) */
  envVar?: string;
  /** Default log level if environment variable not set */
  defaultLevel?: LogLevel;
  /** Additional custom data to log */
  additionalData?: Record<string, any>;
}

/**
 * Gets the current log level from environment variable
 */
function getLogLevel(config?: LogConfig): LogLevel {
  const envVar = config?.envVar || 'LOG_LEVEL';
  const envLevel = process.env[envVar]?.toLowerCase();
  
  const validLevels = Object.values(LogLevel);
  if (envLevel && validLevels.includes(envLevel as LogLevel)) {
    return envLevel as LogLevel;
  }
  
  return config?.defaultLevel || LogLevel.INFO;
}

/**
 * Checks if current log level allows logging
 */
function shouldLog(currentLevel: LogLevel, requiredLevel: LogLevel): boolean {
  const levels = [LogLevel.NONE, LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG];
  const currentIndex = levels.indexOf(currentLevel);
  const requiredIndex = levels.indexOf(requiredLevel);
  
  return currentIndex >= requiredIndex;
}

/**
 * Logs API Gateway event information for tracking and debugging
 * 
 * @param event - API Gateway proxy event
 * @param context - Lambda context
 * @param config - Optional logging configuration
 * 
 * @example
 * ```typescript
 * export const handler = async (event: APIGatewayProxyEvent, context: Context) => {
 *   logApiGatewayEvent(event, context);
 *   // ... rest of handler
 * };
 * ```
 */
export function logApiGatewayEvent(
  event: APIGatewayProxyEvent,
  context: Context,
  config?: LogConfig
): void {
  const logLevel = getLogLevel(config);
  
  if (!shouldLog(logLevel, LogLevel.INFO)) {
    return;
  }

  const identifier = `${context.functionName}:${event.requestContext.requestId}`;
  
  const logData = {
    requestId: context.awsRequestId,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    httpMethod: event.httpMethod,
    path: event.path,
    resource: event.resource,
    stage: event.requestContext.stage,
    sourceIp: event.requestContext.identity.sourceIp,
    userAgent: event.requestContext.identity.userAgent,
    apiId: event.requestContext.apiId,
    requestTimeEpoch: event.requestContext.requestTimeEpoch,
    queryStringParameters: event.queryStringParameters,
    pathParameters: event.pathParameters,
    headers: shouldLog(logLevel, LogLevel.DEBUG) ? event.headers : {
      'user-agent': event.headers['user-agent'] || event.headers['User-Agent'],
      'x-forwarded-for': event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For'],
    },
    ...(config?.additionalData || {}),
  };

  console.info(`Entry API Gateway ${identifier}`, logData);
}

/**
 * Logs SQS event information for tracking and debugging
 * 
 * @param event - SQS event
 * @param context - Lambda context
 * @param config - Optional logging configuration
 * 
 * @example
 * ```typescript
 * export const handler = async (event: SQSEvent, context: Context) => {
 *   logSqsEvent(event, context);
 *   // ... rest of handler
 * };
 * ```
 */
export function logSqsEvent(
  event: SQSEvent,
  context: Context,
  config?: LogConfig
): void {
  const logLevel = getLogLevel(config);
  
  if (!shouldLog(logLevel, LogLevel.INFO)) {
    return;
  }

  const identifier = `${context.functionName}:${context.awsRequestId}`;
  
  // Log geral do evento
  const eventSummary = {
    requestId: context.awsRequestId,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    recordCount: event.Records.length,
    queueArn: event.Records[0]?.eventSourceARN,
    ...(config?.additionalData || {}),
  };

  console.info(`Entry SQS Event ${identifier}`, eventSummary);

  // Log individual de cada mensagem
  for (let index = 0; index < event.Records.length; index++) {
    const record = event.Records[index];
    const recordIdentifier = `${identifier}:${record.messageId}`;
    const recordData = {
      recordIndex: index + 1,
      totalRecords: event.Records.length,
      messageId: record.messageId,
      receiptHandle: shouldLog(logLevel, LogLevel.DEBUG) ? record.receiptHandle : '***',
      body: shouldLog(logLevel, LogLevel.DEBUG) ? record.body : `${record.body.substring(0, 100)}...`,
      attributes: record.attributes,
      messageAttributes: record.messageAttributes,
      md5OfBody: record.md5OfBody,
      eventSourceARN: record.eventSourceARN,
      awsRegion: record.awsRegion,
    };

    console.info(`SQS Record ${recordIdentifier}`, recordData);
  }
}

/**
 * Logs SNS event information for tracking and debugging
 * 
 * @param event - SNS event
 * @param context - Lambda context
 * @param config - Optional logging configuration
 * 
 * @example
 * ```typescript
 * export const handler = async (event: SNSEvent, context: Context) => {
 *   logSnsEvent(event, context);
 *   // ... rest of handler
 * };
 * ```
 */
export function logSnsEvent(
  event: SNSEvent,
  context: Context,
  config?: LogConfig
): void {
  const logLevel = getLogLevel(config);
  
  if (!shouldLog(logLevel, LogLevel.INFO)) {
    return;
  }

  const identifier = `${context.functionName}:${context.awsRequestId}`;
  
  // Log geral do evento
  const eventSummary = {
    requestId: context.awsRequestId,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    recordCount: event.Records.length,
    topicArn: event.Records[0]?.Sns.TopicArn,
    ...(config?.additionalData || {}),
  };

  console.info(`Entry SNS Event ${identifier}`, eventSummary);

  // Log individual de cada mensagem
  for (let index = 0; index < event.Records.length; index++) {
    const record = event.Records[index];
    const recordIdentifier = `${identifier}:${record.Sns.MessageId}`;
    const recordData = {
      recordIndex: index + 1,
      totalRecords: event.Records.length,
      messageId: record.Sns.MessageId,
      subject: record.Sns.Subject,
      message: shouldLog(logLevel, LogLevel.DEBUG) 
        ? record.Sns.Message 
        : `${record.Sns.Message.substring(0, 100)}...`,
      timestamp: record.Sns.Timestamp,
      topicArn: record.Sns.TopicArn,
      type: record.Sns.Type,
      messageAttributes: record.Sns.MessageAttributes,
    };

    console.info(`SNS Record ${recordIdentifier}`, recordData);
  }
}

/**
 * Logs EventBridge (CloudWatch Events) information for tracking and debugging
 * Used for scheduled events (cron) and custom events
 * 
 * @param event - EventBridge event
 * @param context - Lambda context
 * @param config - Optional logging configuration
 * 
 * @example
 * ```typescript
 * export const handler = async (event: EventBridgeEvent<string, any>, context: Context) => {
 *   logEventBridgeEvent(event, context);
 *   // ... rest of handler
 * };
 * ```
 */
export function logEventBridgeEvent(
  event: EventBridgeEvent<string, any>,
  context: Context,
  config?: LogConfig
): void {
  const logLevel = getLogLevel(config);
  
  if (!shouldLog(logLevel, LogLevel.INFO)) {
    return;
  }

  const identifier = `${context.functionName}:${event.id}`;
  
  const logData = {
    requestId: context.awsRequestId,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    eventId: event.id,
    eventVersion: event.version,
    eventTime: event.time,
    eventSource: event.source,
    detailType: event['detail-type'],
    region: event.region,
    account: event.account,
    resources: event.resources,
    detail: shouldLog(logLevel, LogLevel.DEBUG) 
      ? event.detail 
      : Object.keys(event.detail || {}).join(', '),
    ...(config?.additionalData || {}),
  };

  console.info(`Entry EventBridge ${identifier}`, logData);
}

/**
 * Logs S3 event information for tracking and debugging
 * 
 * @param event - S3 event
 * @param context - Lambda context
 * @param config - Optional logging configuration
 * 
 * @example
 * ```typescript
 * export const handler = async (event: S3Event, context: Context) => {
 *   logS3Event(event, context);
 *   // ... rest of handler
 * };
 * ```
 */
export function logS3Event(
  event: S3Event,
  context: Context,
  config?: LogConfig
): void {
  const logLevel = getLogLevel(config);
  
  if (!shouldLog(logLevel, LogLevel.INFO)) {
    return;
  }

  const identifier = `${context.functionName}:${context.awsRequestId}`;
  
  // Log geral do evento
  const eventSummary = {
    requestId: context.awsRequestId,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    recordCount: event.Records.length,
    bucketName: event.Records[0]?.s3.bucket.name,
    ...(config?.additionalData || {}),
  };

  console.info(`Entry S3 Event ${identifier}`, eventSummary);

  // Log individual de cada objeto
  for (let index = 0; index < event.Records.length; index++) {
    const record = event.Records[index];
    const s3RequestId = record.responseElements?.['x-amz-request-id'] || 'unknown';
    const recordIdentifier = `${identifier}:${s3RequestId}`;
    const recordData = {
      recordIndex: index + 1,
      totalRecords: event.Records.length,
      eventName: record.eventName,
      eventTime: record.eventTime,
      awsRegion: record.awsRegion,
      bucketName: record.s3.bucket.name,
      bucketArn: record.s3.bucket.arn,
      objectKey: decodeURIComponent(record.s3.object.key.replace(/\+/g, ' ')),
      objectSize: record.s3.object.size,
      objectETag: record.s3.object.eTag,
      objectVersionId: record.s3.object.versionId,
      requestId: s3RequestId,
      sourceIp: record.requestParameters?.sourceIPAddress,
    };

    console.info(`S3 Record ${recordIdentifier}`, recordData);
  }
}

/**
 * Logs DynamoDB Stream event information for tracking and debugging
 * 
 * @param event - DynamoDB Stream event
 * @param context - Lambda context
 * @param config - Optional logging configuration
 * 
 * @example
 * ```typescript
 * export const handler = async (event: DynamoDBStreamEvent, context: Context) => {
 *   logDynamoDBStreamEvent(event, context);
 *   // ... rest of handler
 * };
 * ```
 */
export function logDynamoDBStreamEvent(
  event: DynamoDBStreamEvent,
  context: Context,
  config?: LogConfig
): void {
  const logLevel = getLogLevel(config);
  
  if (!shouldLog(logLevel, LogLevel.INFO)) {
    return;
  }

  const identifier = `${context.functionName}:${context.awsRequestId}`;
  const tableName = event.Records[0]?.eventSourceARN?.split('/')[1];
  
  // Log geral do evento
  const eventSummary = {
    requestId: context.awsRequestId,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    recordCount: event.Records.length,
    tableName: tableName,
    streamArn: event.Records[0]?.eventSourceARN,
    ...(config?.additionalData || {}),
  };

  console.info(`Entry DynamoDB Stream Event ${identifier}`, eventSummary);

  // Log individual de cada registro
  for (let index = 0; index < event.Records.length; index++) {
    const record = event.Records[index];
    const recordIdentifier = `${identifier}:${record.eventID}`;
    const recordData = {
      recordIndex: index + 1,
      totalRecords: event.Records.length,
      eventID: record.eventID,
      eventName: record.eventName,
      eventVersion: record.eventVersion,
      awsRegion: record.awsRegion,
      tableName: record.eventSourceARN?.split('/')[1],
      approximateCreationDateTime: record.dynamodb?.ApproximateCreationDateTime,
      streamViewType: record.dynamodb?.StreamViewType,
      sequenceNumber: record.dynamodb?.SequenceNumber,
      sizeBytes: record.dynamodb?.SizeBytes,
      keys: shouldLog(logLevel, LogLevel.DEBUG) 
        ? record.dynamodb?.Keys 
        : Object.keys(record.dynamodb?.Keys || {}).join(', '),
      newImage: shouldLog(logLevel, LogLevel.DEBUG)
        ? record.dynamodb?.NewImage
        : record.dynamodb?.NewImage ? Object.keys(record.dynamodb.NewImage).join(', ') : undefined,
      oldImage: shouldLog(logLevel, LogLevel.DEBUG)
        ? record.dynamodb?.OldImage
        : record.dynamodb?.OldImage ? Object.keys(record.dynamodb.OldImage).join(', ') : undefined,
    };

    console.info(`DynamoDB Stream Record ${recordIdentifier}`, recordData);
  }
}


