import { 
  APIGatewayProxyEvent, 
  SQSEvent, 
  SNSEvent, 
  EventBridgeEvent,
  S3Event,
  DynamoDBStreamEvent,
  AppSyncResolverEvent,
  Context 
} from 'aws-lambda';

/**
 * Configuration for Lambda event logging
 */
export interface LogConfig {
  /** Additional custom data to log */
  additionalData?: Record<string, any>;
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
    ...(config?.additionalData || {}),
  };

  console.info(`Entry API Gateway ${identifier}`, logData);
  
  // Log headers in debug level
  console.debug(`API Gateway Headers ${identifier}`, event.headers);
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
      body: `${record.body.substring(0, 100)}...`,
      attributes: record.attributes,
      messageAttributes: record.messageAttributes,
      md5OfBody: record.md5OfBody,
      eventSourceARN: record.eventSourceARN,
      awsRegion: record.awsRegion,
    };

    console.info(`SQS Record ${recordIdentifier}`, recordData);
    
    // Log full body in debug
    console.debug(`SQS Record Full Body ${recordIdentifier}`, {
      messageId: record.messageId,
      body: record.body,
      receiptHandle: record.receiptHandle,
    });
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
      message: `${record.Sns.Message.substring(0, 100)}...`,
      timestamp: record.Sns.Timestamp,
      topicArn: record.Sns.TopicArn,
      type: record.Sns.Type,
      messageAttributes: record.Sns.MessageAttributes,
    };

    console.info(`SNS Record ${recordIdentifier}`, recordData);
    
    // Log full message in debug
    console.debug(`SNS Record Full Message ${recordIdentifier}`, {
      messageId: record.Sns.MessageId,
      message: record.Sns.Message,
    });
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
    detailKeys: Object.keys(event.detail || {}).join(', '),
    ...(config?.additionalData || {}),
  };

  console.info(`Entry EventBridge ${identifier}`, logData);
  
  // Log full detail in debug
  console.debug(`EventBridge Detail ${identifier}`, event.detail);
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
      keys: Object.keys(record.dynamodb?.Keys || {}).join(', '),
      newImageKeys: record.dynamodb?.NewImage ? Object.keys(record.dynamodb.NewImage).join(', ') : undefined,
      oldImageKeys: record.dynamodb?.OldImage ? Object.keys(record.dynamodb.OldImage).join(', ') : undefined,
    };

    console.info(`DynamoDB Stream Record ${recordIdentifier}`, recordData);
    
    // Log full data in debug
    console.debug(`DynamoDB Stream Full Data ${recordIdentifier}`, {
      eventID: record.eventID,
      keys: record.dynamodb?.Keys,
      newImage: record.dynamodb?.NewImage,
      oldImage: record.dynamodb?.OldImage,
    });
  }
}

/**
 * Logs AppSync resolver event information for tracking and debugging
 * 
 * Works with Query, Mutation, and Field resolvers. The operation type
 * is automatically detected from event.info.parentTypeName.
 * 
 * @param event - AppSync resolver event
 * @param context - Lambda context
 * @param config - Optional logging configuration
 * 
 * @example
 * ```typescript
 * export const resolver: AppSyncResolverHandler<Args, Result> = async (event, context) => {
 *   logAppSyncEvent(event, context);
 *   // ... rest of resolver
 * };
 * ```
 */
export function logAppSyncEvent<TArguments = Record<string, any>, TSource = Record<string, any>>(
  event: AppSyncResolverEvent<TArguments, TSource>,
  context: Context,
  config?: LogConfig
): void {
  const identifier = `${context.functionName}:${context.awsRequestId}`;
  
  // Extract identity info safely across different identity types
  const identity = event.identity as any;
  const identityValue = identity?.sub || identity?.username || identity?.resolverContext || 'anonymous';
  const identityType = !identity ? 'none' :
    identity.sub ? 'Cognito' :
    identity.accountId ? 'IAM' :
    identity.resolverContext ? 'Lambda' :
    'API_KEY';
  
  const logData = {
    requestId: context.awsRequestId,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    operation: event.info.parentTypeName,
    fieldName: event.info.fieldName,
    selectionSetList: event.info.selectionSetList,
    identity: identityValue,
    identityType,
    argumentKeys: Object.keys(event.arguments || {}),
    hasSource: !!event.source,
    sourceKeys: event.source ? Object.keys(event.source as object) : undefined,
    ...(config?.additionalData || {}),
  };

  console.info(`Entry AppSync ${identifier}`, logData);
  
  // Log full arguments and source in debug
  console.debug(`AppSync Full Data ${identifier}`, {
    arguments: event.arguments,
    source: event.source,
    requestHeaders: event.request?.headers,
    stash: event.stash,
    prev: event.prev?.result,
  });
}
