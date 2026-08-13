/**
 * Entry-point loggers for the most common Lambda event sources.
 *
 * Every helper writes through {@link getLogger}, always passing the **object first
 * and the message second**. That order is what makes the record land in CloudWatch
 * as top-level, field-indexable JSON properties — `console.info(msg, obj)` would
 * instead emit an inspected object glued to a text line, which Logs Insights cannot
 * query by `requestId`, `messageId`, ... The logger also writes straight to
 * `process.stdout`, avoiding the double JSON envelope `console.*` produces under
 * Lambda Advanced Logging Controls (`AWS_LAMBDA_LOG_FORMAT=JSON`).
 *
 * @module loggers/logLambdaEvent
 */

import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  SQSEvent,
  SNSEvent,
  EventBridgeEvent,
  S3Event,
  DynamoDBStreamEvent,
  AppSyncResolverEvent,
  Context,
} from 'aws-lambda';
import { decodeS3ObjectKey } from '../extractors/decode-s3-object-key/index.js';
import { getLogger } from './logger.js';

/**
 * Configuration for Lambda event logging
 */
export interface LogConfig {
  /** Additional custom data to log */
  additionalData?: Record<string, any>;
}

/**
 * Reduces the raw `Cookie` header values of a payload-format-2.0 event to their names.
 *
 * Knowing *which* cookies arrived answers the questions an entry log is for — was the session
 * cookie present, did the consent flag survive the redirect — while the values are the session
 * itself. Redaction by key name cannot help here: the array holds `name=value` strings, so by
 * the time it reaches the serializer it is opaque text.
 *
 * @param cookies - `cookies` field of the event
 * @returns The cookie names, or undefined when the event carried none
 */
function toCookieNames(cookies: string[] | undefined): string[] | undefined {
  return cookies?.map((cookie) => cookie.split('=')[0]?.trim() ?? '');
}

/**
 * Logs API Gateway event information for tracking and debugging
 *
 * @param event - API Gateway proxy event
 * @param context - Lambda context
 * @param config - Optional logging configuration
 * @returns Nothing
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

  getLogger().info(logData, `Entry API Gateway ${identifier}`);

  getLogger().debug(event.headers, `API Gateway Headers ${identifier}`);
}

/**
 * Logs API Gateway V2 event information for tracking and debugging
 *
 * Used for HTTP API (Payload Format 2.0) which has a different structure than V1.
 * In V2, properties like sourceIp and userAgent are in requestContext.http instead of requestContext.identity.
 *
 * @param event - API Gateway proxy event V2
 * @param context - Lambda context
 * @param config - Optional logging configuration
 * @returns Nothing
 *
 * @example
 * ```typescript
 * export const handler = async (event: APIGatewayProxyEventV2, context: Context) => {
 *   logApiGatewayEventV2(event, context);
 *   // ... rest of handler
 * };
 * ```
 */
export function logApiGatewayEventV2(
  event: APIGatewayProxyEventV2,
  context: Context,
  config?: LogConfig
): void {
  const identifier = `${context.functionName}:${event.requestContext.requestId}`;

  const logData = {
    requestId: context.awsRequestId,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    httpMethod: event.requestContext.http.method,
    path: event.requestContext.http.path,
    routeKey: event.routeKey,
    stage: event.requestContext.stage,
    sourceIp: event.requestContext.http.sourceIp,
    userAgent: event.requestContext.http.userAgent,
    apiId: event.requestContext.apiId,
    requestTimeEpoch: event.requestContext.timeEpoch,
    queryStringParameters: event.queryStringParameters,
    pathParameters: event.pathParameters,
    // Names only. The values are session material on every single request, and a truncated
    // or structured copy of them is unredactable once it is a plain string in CloudWatch.
    cookieNames: toCookieNames(event.cookies),
    ...(config?.additionalData || {}),
  };

  getLogger().info(logData, `Entry API Gateway V2 ${identifier}`);

  getLogger().debug(event.headers, `API Gateway V2 Headers ${identifier}`);
}

/**
 * Logs SQS event information for tracking and debugging
 *
 * @param event - SQS event
 * @param context - Lambda context
 * @param config - Optional logging configuration
 * @returns Nothing
 *
 * @example
 * ```typescript
 * export const handler = async (event: SQSEvent, context: Context) => {
 *   logSqsEvent(event, context);
 *   // ... rest of handler
 * };
 * ```
 */
export function logSqsEvent(event: SQSEvent, context: Context, config?: LogConfig): void {
  const identifier = `${context.functionName}:${context.awsRequestId}`;

  const eventSummary = {
    requestId: context.awsRequestId,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    recordCount: event.Records.length,
    queueArn: event.Records[0]?.eventSourceARN,
    ...(config?.additionalData || {}),
  };

  getLogger().info(eventSummary, `Entry SQS Event ${identifier}`);

  for (let index = 0; index < event.Records.length; index++) {
    const record = event.Records[index];
    const recordIdentifier = `${identifier}:${record.messageId}`;
    const recordData = {
      recordIndex: index + 1,
      totalRecords: event.Records.length,
      messageId: record.messageId,
      // No body preview at INFO: the first 100 characters of a JSON message are exactly
      // where a token or a document number sits, and a truncated string cannot be redacted
      // by key name. The full body is one level down, at DEBUG.
      bodyBytes: record.body.length,
      attributes: record.attributes,
      md5OfBody: record.md5OfBody,
      eventSourceARN: record.eventSourceARN,
      awsRegion: record.awsRegion,
    };

    getLogger().info(recordData, `SQS Record ${recordIdentifier}`);

    getLogger().debug(
      {
        messageId: record.messageId,
        body: record.body,
        // `receiptHandle` is deliberately absent: it is a capability — anyone holding it can
        // delete the message or change its visibility — and it identifies nothing that
        // `messageId` does not.
      },
      `SQS Record Full Body ${recordIdentifier}`
    );
  }
}

/**
 * Logs SNS event information for tracking and debugging
 *
 * @param event - SNS event
 * @param context - Lambda context
 * @param config - Optional logging configuration
 * @returns Nothing
 *
 * @example
 * ```typescript
 * export const handler = async (event: SNSEvent, context: Context) => {
 *   logSnsEvent(event, context);
 *   // ... rest of handler
 * };
 * ```
 */
export function logSnsEvent(event: SNSEvent, context: Context, config?: LogConfig): void {
  const identifier = `${context.functionName}:${context.awsRequestId}`;

  const eventSummary = {
    requestId: context.awsRequestId,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    recordCount: event.Records.length,
    topicArn: event.Records[0]?.Sns.TopicArn,
    ...(config?.additionalData || {}),
  };

  getLogger().info(eventSummary, `Entry SNS Event ${identifier}`);

  for (let index = 0; index < event.Records.length; index++) {
    const record = event.Records[index];
    const recordIdentifier = `${identifier}:${record.Sns.MessageId}`;
    const recordData = {
      recordIndex: index + 1,
      totalRecords: event.Records.length,
      messageId: record.Sns.MessageId,
      subject: record.Sns.Subject,
      // Same reasoning as the SQS preview: the payload belongs at DEBUG, whole.
      messageBytes: record.Sns.Message.length,
      timestamp: record.Sns.Timestamp,
      topicArn: record.Sns.TopicArn,
      type: record.Sns.Type,
    };

    getLogger().info(recordData, `SNS Record ${recordIdentifier}`);

    getLogger().debug(
      {
        messageId: record.Sns.MessageId,
        message: record.Sns.Message,
      },
      `SNS Record Full Message ${recordIdentifier}`
    );
  }
}

/**
 * Logs EventBridge (CloudWatch Events) information for tracking and debugging
 * Used for scheduled events (cron) and custom events
 *
 * @param event - EventBridge event
 * @param context - Lambda context
 * @param config - Optional logging configuration
 * @returns Nothing
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

  getLogger().info(logData, `Entry EventBridge ${identifier}`);

  getLogger().debug(event.detail, `EventBridge Detail ${identifier}`);
}

/**
 * Logs S3 event information for tracking and debugging
 *
 * @param event - S3 event
 * @param context - Lambda context
 * @param config - Optional logging configuration
 * @returns Nothing
 *
 * @example
 * ```typescript
 * export const handler = async (event: S3Event, context: Context) => {
 *   logS3Event(event, context);
 *   // ... rest of handler
 * };
 * ```
 */
export function logS3Event(event: S3Event, context: Context, config?: LogConfig): void {
  const identifier = `${context.functionName}:${context.awsRequestId}`;

  const eventSummary = {
    requestId: context.awsRequestId,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    recordCount: event.Records.length,
    bucketName: event.Records[0]?.s3.bucket.name,
    ...(config?.additionalData || {}),
  };

  getLogger().info(eventSummary, `Entry S3 Event ${identifier}`);

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
      objectKey: decodeS3ObjectKey(record.s3.object.key),
      objectSize: record.s3.object.size,
      objectETag: record.s3.object.eTag,
      objectVersionId: record.s3.object.versionId,
      requestId: s3RequestId,
      sourceIp: record.requestParameters?.sourceIPAddress,
    };

    getLogger().info(recordData, `S3 Record ${recordIdentifier}`);
  }
}

/**
 * Logs DynamoDB Stream event information for tracking and debugging
 *
 * @param event - DynamoDB Stream event
 * @param context - Lambda context
 * @param config - Optional logging configuration
 * @returns Nothing
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

  const eventSummary = {
    requestId: context.awsRequestId,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    recordCount: event.Records.length,
    tableName: tableName,
    streamArn: event.Records[0]?.eventSourceARN,
    ...(config?.additionalData || {}),
  };

  getLogger().info(eventSummary, `Entry DynamoDB Stream Event ${identifier}`);

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
      newImageKeys: record.dynamodb?.NewImage
        ? Object.keys(record.dynamodb.NewImage).join(', ')
        : undefined,
      oldImageKeys: record.dynamodb?.OldImage
        ? Object.keys(record.dynamodb.OldImage).join(', ')
        : undefined,
    };

    getLogger().info(recordData, `DynamoDB Stream Record ${recordIdentifier}`);

    getLogger().debug(
      {
        eventID: record.eventID,
        keys: record.dynamodb?.Keys,
        newImage: record.dynamodb?.NewImage,
        oldImage: record.dynamodb?.OldImage,
      },
      `DynamoDB Stream Full Data ${recordIdentifier}`
    );
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
 * @returns Nothing
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
  // A Lambda authorizer's `resolverContext` is a whole object — decoded JWT claims, permission
  // sets, tenant ids — and it used to be logged verbatim under `identity` on every resolver
  // call. Its key list identifies the caller shape without publishing the claims, matching
  // what `argumentKeys` does on the next lines. `??` rather than `||`: an identity whose `sub`
  // is the empty string is still a Cognito identity, and must not fall through to `username`.
  const identityValue =
    identity?.sub ??
    identity?.username ??
    (identity?.resolverContext
      ? `resolverContext(${Object.keys(identity.resolverContext).join(', ')})`
      : undefined) ??
    'anonymous';
  const identityType = !identity
    ? 'none'
    : identity.sub
      ? 'Cognito'
      : identity.accountId
        ? 'IAM'
        : identity.resolverContext
          ? 'Lambda'
          : 'API_KEY';

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

  getLogger().info(logData, `Entry AppSync ${identifier}`);

  getLogger().debug(
    {
      arguments: event.arguments,
      source: event.source,
      requestHeaders: event.request?.headers,
      stash: event.stash,
      prev: event.prev?.result,
    },
    `AppSync Full Data ${identifier}`
  );
}
