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
import {
  logApiGatewayEvent,
  logApiGatewayEventV2,
  logSqsEvent,
  logSnsEvent,
  logEventBridgeEvent,
  logS3Event,
  logDynamoDBStreamEvent,
  logAppSyncEvent,
} from './logLambdaEvent.js';
import {
  setLogger,
  resetLogger,
  setLogSink,
  resetLogSink,
  setLogLevel,
  resetLogLevel,
} from './logger.js';

/**
 * A recorded logger call, in the object-first order mandated by the `Logger`
 * contract: `[obj, msg]`.
 */
type LogCall = [any, string | undefined];

let infoOutput: LogCall[] = [];
let debugOutput: LogCall[] = [];
let warnOutput: LogCall[] = [];
let errorOutput: LogCall[] = [];

beforeEach(() => {
  infoOutput = [];
  debugOutput = [];
  warnOutput = [];
  errorOutput = [];

  setLogger({
    info: jest.fn((obj: unknown, msg?: string) => {
      infoOutput.push([obj, msg]);
    }),
    debug: jest.fn((obj: unknown, msg?: string) => {
      debugOutput.push([obj, msg]);
    }),
    warn: jest.fn((obj: unknown, msg?: string) => {
      warnOutput.push([obj, msg]);
    }),
    error: jest.fn((obj: unknown, msg?: string) => {
      errorOutput.push([obj, msg]);
    }),
  });
});

afterEach(() => {
  resetLogger();
  resetLogSink();
});

/**
 * Asserts the structured contract of a recorded call: the payload is a plain
 * object (never an interpolated string) and the message is the second argument.
 *
 * @param call - Recorded `[obj, msg]` pair
 * @param expectedMessage - Message expected in the second position
 * @returns The payload object, for further field assertions
 */
const expectStructured = (call: LogCall, expectedMessage: string): any => {
  const [payload, message] = call;
  expect(typeof payload).toBe('object');
  expect(payload).not.toBeNull();
  expect(typeof message).toBe('string');
  expect(message).toBe(expectedMessage);
  return payload;
};

const createMockContext = (): Context => ({
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test-function',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
  memoryLimitInMB: '128',
  awsRequestId: 'test-request-id-123',
  logGroupName: '/aws/lambda/test-function',
  logStreamName: '2025/12/08/[$LATEST]abcdef',
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
});

const createMockApiGatewayEvent = (): APIGatewayProxyEvent => ({
  body: null,
  headers: {
    'user-agent': 'Mozilla/5.0',
    'x-forwarded-for': '192.168.1.1',
  },
  multiValueHeaders: {},
  httpMethod: 'GET',
  isBase64Encoded: false,
  path: '/users/123',
  pathParameters: { id: '123' },
  queryStringParameters: { page: '1', limit: '10' },
  multiValueQueryStringParameters: null,
  stageVariables: null,
  requestContext: {
    accountId: '123456789012',
    apiId: 'test-api-id',
    authorizer: null,
    protocol: 'HTTP/1.1',
    httpMethod: 'GET',
    path: '/users/123',
    stage: 'prod',
    requestId: 'api-request-id',
    requestTimeEpoch: 1702000000000,
    resourceId: 'resource-id',
    resourcePath: '/users/{id}',
    identity: {
      accessKey: null,
      accountId: null,
      apiKey: null,
      apiKeyId: null,
      caller: null,
      clientCert: null,
      cognitoAuthenticationProvider: null,
      cognitoAuthenticationType: null,
      cognitoIdentityId: null,
      cognitoIdentityPoolId: null,
      principalOrgId: null,
      sourceIp: '192.168.1.1',
      user: null,
      userAgent: 'Mozilla/5.0',
      userArn: null,
    },
  },
  resource: '/users/{id}',
});

const createMockApiGatewayEventV2 = (): APIGatewayProxyEventV2 => ({
  version: '2.0',
  routeKey: 'GET /users/{id}',
  rawPath: '/users/123',
  rawQueryString: 'page=1&limit=10',
  cookies: ['session=abc123'],
  headers: {
    'user-agent': 'Mozilla/5.0',
    'x-forwarded-for': '192.168.1.1',
  },
  queryStringParameters: { page: '1', limit: '10' },
  requestContext: {
    accountId: '123456789012',
    apiId: 'test-api-id-v2',
    domainName: 'api.example.com',
    domainPrefix: 'api',
    http: {
      method: 'GET',
      path: '/users/123',
      protocol: 'HTTP/1.1',
      sourceIp: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    },
    requestId: 'api-request-id-v2',
    routeKey: 'GET /users/{id}',
    stage: 'prod',
    time: '08/Dec/2025:10:00:00 +0000',
    timeEpoch: 1702000000000,
  },
  body: undefined,
  pathParameters: { id: '123' },
  isBase64Encoded: false,
  stageVariables: undefined,
});

const createMockSqsRecord = (messageId: string): SQSEvent['Records'][number] => ({
  messageId,
  receiptHandle: 'receipt-handle-xyz',
  body: JSON.stringify({ userId: 123, action: 'update' }),
  attributes: {
    ApproximateReceiveCount: '1',
    SentTimestamp: '1702000000000',
    SenderId: 'AIDAI123456789',
    ApproximateFirstReceiveTimestamp: '1702000000000',
  },
  messageAttributes: {},
  md5OfBody: 'abc123',
  eventSource: 'aws:sqs',
  eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:my-queue',
  awsRegion: 'us-east-1',
});

const createMockSqsEvent = (): SQSEvent => ({
  Records: [createMockSqsRecord('msg-123')],
});

const createMockSnsEvent = (): SNSEvent => ({
  Records: [
    {
      EventVersion: '1.0',
      EventSubscriptionArn: 'arn:aws:sns:us-east-1:123456789012:my-topic:subscription-id',
      EventSource: 'aws:sns',
      Sns: {
        SignatureVersion: '1',
        Timestamp: '2025-12-08T10:00:00.000Z',
        Signature: 'signature',
        SigningCertUrl: 'https://cert-url',
        MessageId: 'sns-msg-123',
        Message: JSON.stringify({ userId: 123, event: 'user-created' }),
        MessageAttributes: {},
        Type: 'Notification',
        UnsubscribeUrl: 'https://unsubscribe-url',
        TopicArn: 'arn:aws:sns:us-east-1:123456789012:my-topic',
        Subject: 'User Created Event',
      },
    },
  ],
});

const createMockEventBridgeEvent = (): EventBridgeEvent<string, any> => ({
  id: 'event-123',
  version: '0',
  account: '123456789012',
  time: '2025-12-08T10:00:00Z',
  region: 'us-east-1',
  resources: ['arn:aws:events:us-east-1:123456789012:rule/my-rule'],
  source: 'aws.events',
  'detail-type': 'Scheduled Event',
  detail: {
    scheduledTime: '2025-12-08T10:00:00Z',
    cronExpression: 'cron(0 10 * * ? *)',
  },
});

describe('logApiGatewayEvent', () => {
  it('should log API Gateway event info as a structured object', () => {
    const event = createMockApiGatewayEvent();
    const context = createMockContext();

    logApiGatewayEvent(event, context);

    expect(infoOutput).toHaveLength(1);
    const logData = expectStructured(
      infoOutput[0],
      'Entry API Gateway test-function:api-request-id'
    );
    expect(logData.eventType).toBeUndefined();
    expect(logData.requestId).toBe('test-request-id-123');
    expect(logData.functionName).toBe('test-function');
    expect(logData.functionVersion).toBe('1');
    expect(logData.httpMethod).toBe('GET');
    expect(logData.path).toBe('/users/123');
    expect(logData.resource).toBe('/users/{id}');
    expect(logData.stage).toBe('prod');
    expect(logData.sourceIp).toBe('192.168.1.1');
    expect(logData.userAgent).toBe('Mozilla/5.0');
    expect(logData.apiId).toBe('test-api-id');
    expect(logData.requestTimeEpoch).toBe(1702000000000);
    expect(logData.queryStringParameters).toEqual({ page: '1', limit: '10' });
    expect(logData.pathParameters).toEqual({ id: '123' });
  });

  it('should pass the object first and the message second', () => {
    const event = createMockApiGatewayEvent();
    const context = createMockContext();

    logApiGatewayEvent(event, context);

    const [payload, message] = infoOutput[0];
    expect(typeof payload).toBe('object');
    expect(typeof message).toBe('string');
    // The message must stay a plain identifier: no data interpolated into it.
    expect(message).not.toContain('httpMethod');
  });

  it('should log all headers in debug output', () => {
    const event = createMockApiGatewayEvent();
    const context = createMockContext();

    logApiGatewayEvent(event, context);

    expect(debugOutput).toHaveLength(1);
    const headers = expectStructured(
      debugOutput[0],
      'API Gateway Headers test-function:api-request-id'
    );
    expect(headers).toHaveProperty('user-agent');
    expect(headers).toHaveProperty('x-forwarded-for');
  });

  it('should include additional data when provided', () => {
    const event = createMockApiGatewayEvent();
    const context = createMockContext();

    logApiGatewayEvent(event, context, {
      additionalData: { customField: 'customValue' },
    });

    const [logData] = infoOutput[0];
    expect(logData.customField).toBe('customValue');
  });

  it('should not emit warn or error records', () => {
    logApiGatewayEvent(createMockApiGatewayEvent(), createMockContext());

    expect(warnOutput).toHaveLength(0);
    expect(errorOutput).toHaveLength(0);
  });
});

describe('logApiGatewayEventV2', () => {
  it('should log API Gateway V2 event info as a structured object', () => {
    const event = createMockApiGatewayEventV2();
    const context = createMockContext();

    logApiGatewayEventV2(event, context);

    expect(infoOutput).toHaveLength(1);
    const logData = expectStructured(
      infoOutput[0],
      'Entry API Gateway V2 test-function:api-request-id-v2'
    );
    expect(logData.requestId).toBe('test-request-id-123');
    expect(logData.httpMethod).toBe('GET');
    expect(logData.path).toBe('/users/123');
    expect(logData.routeKey).toBe('GET /users/{id}');
    expect(logData.stage).toBe('prod');
    expect(logData.sourceIp).toBe('192.168.1.1');
    expect(logData.userAgent).toBe('Mozilla/5.0');
    expect(logData.apiId).toBe('test-api-id-v2');
    expect(logData.requestTimeEpoch).toBe(1702000000000);
    // Names only: the values are the session itself, on every request.
    expect(logData.cookies).toBeUndefined();
    expect(logData.cookieNames).toEqual(['session']);
  });

  it('should log all headers in debug output', () => {
    const event = createMockApiGatewayEventV2();
    const context = createMockContext();

    logApiGatewayEventV2(event, context);

    expect(debugOutput).toHaveLength(1);
    const headers = expectStructured(
      debugOutput[0],
      'API Gateway V2 Headers test-function:api-request-id-v2'
    );
    expect(headers).toHaveProperty('user-agent');
    expect(headers).toHaveProperty('x-forwarded-for');
  });

  it('should include additional data when provided', () => {
    const event = createMockApiGatewayEventV2();
    const context = createMockContext();

    logApiGatewayEventV2(event, context, {
      additionalData: { customField: 'customValue' },
    });

    const [logData] = infoOutput[0];
    expect(logData.customField).toBe('customValue');
  });

  it('should handle missing cookies', () => {
    const event = createMockApiGatewayEventV2();
    event.cookies = undefined;
    const context = createMockContext();

    logApiGatewayEventV2(event, context);

    const [logData] = infoOutput[0];
    expect(logData.cookies).toBeUndefined();
  });
});

describe('logSqsEvent', () => {
  it('should log SQS event info as structured objects', () => {
    const event = createMockSqsEvent();
    const context = createMockContext();

    logSqsEvent(event, context);

    // Should have 2 info logs: 1 general + 1 per record
    expect(infoOutput).toHaveLength(2);

    // Validate general event log
    const eventData = expectStructured(
      infoOutput[0],
      'Entry SQS Event test-function:test-request-id-123'
    );
    expect(eventData.eventType).toBeUndefined();
    expect(eventData.recordCount).toBe(1);
    expect(eventData.queueArn).toBe('arn:aws:sqs:us-east-1:123456789012:my-queue');

    // Validate individual record log
    const recordData = expectStructured(
      infoOutput[1],
      'SQS Record test-function:test-request-id-123:msg-123'
    );
    expect(recordData.messageId).toBe('msg-123');
    expect(recordData.recordIndex).toBe(1);
    expect(recordData.totalRecords).toBe(1);
    expect(recordData.md5OfBody).toBe('abc123');
    expect(recordData.awsRegion).toBe('us-east-1');
    // No preview at INFO: a truncated JSON fragment cannot be redacted by key name.
    expect(recordData.body).toBeUndefined();
    expect(recordData.bodyBytes).toBe(JSON.stringify({ userId: 123, action: 'update' }).length);
  });

  it('should log full body in debug output', () => {
    const event = createMockSqsEvent();
    const context = createMockContext();

    logSqsEvent(event, context);

    expect(debugOutput).toHaveLength(1);
    const recordData = expectStructured(
      debugOutput[0],
      'SQS Record Full Body test-function:test-request-id-123:msg-123'
    );
    expect(recordData.body).toBe(JSON.stringify({ userId: 123, action: 'update' }));
    // The receipt handle is a capability token, not an identifier: holding it is enough to
    // delete the message.
    expect(recordData.receiptHandle).toBeUndefined();
  });

  it('should number every record of a batch', () => {
    const event: SQSEvent = {
      Records: [createMockSqsRecord('msg-1'), createMockSqsRecord('msg-2')],
    };
    const context = createMockContext();

    logSqsEvent(event, context);

    expect(infoOutput).toHaveLength(3);
    expect(debugOutput).toHaveLength(2);
    expect(infoOutput[1][0].recordIndex).toBe(1);
    expect(infoOutput[1][0].totalRecords).toBe(2);
    expect(infoOutput[2][0].recordIndex).toBe(2);
    expect(infoOutput[2][0].messageId).toBe('msg-2');
  });

  it('should handle an empty batch', () => {
    const context = createMockContext();

    logSqsEvent({ Records: [] }, context);

    expect(infoOutput).toHaveLength(1);
    expect(debugOutput).toHaveLength(0);
    const [eventData] = infoOutput[0];
    expect(eventData.recordCount).toBe(0);
    expect(eventData.queueArn).toBeUndefined();
  });

  it('should report the body size instead of a preview in the info record', () => {
    const event = createMockSqsEvent();
    event.Records[0].body = 'x'.repeat(250);
    const context = createMockContext();

    logSqsEvent(event, context);

    const [recordData] = infoOutput[1];
    expect(recordData.body).toBeUndefined();
    expect(recordData.bodyBytes).toBe(250);
  });
});

describe('logSnsEvent', () => {
  it('should log SNS event info as structured objects', () => {
    const event = createMockSnsEvent();
    const context = createMockContext();

    logSnsEvent(event, context);

    // Should have 2 info logs: 1 general + 1 per record
    expect(infoOutput).toHaveLength(2);

    // Validate general event log
    const eventData = expectStructured(
      infoOutput[0],
      'Entry SNS Event test-function:test-request-id-123'
    );
    expect(eventData.eventType).toBeUndefined();
    expect(eventData.recordCount).toBe(1);
    expect(eventData.topicArn).toBe('arn:aws:sns:us-east-1:123456789012:my-topic');

    // Validate individual record log
    const recordData = expectStructured(
      infoOutput[1],
      'SNS Record test-function:test-request-id-123:sns-msg-123'
    );
    expect(recordData.messageId).toBe('sns-msg-123');
    expect(recordData.subject).toBe('User Created Event');
    expect(recordData.topicArn).toBe('arn:aws:sns:us-east-1:123456789012:my-topic');
    expect(recordData.type).toBe('Notification');
    expect(recordData.timestamp).toBe('2025-12-08T10:00:00.000Z');
  });

  it('should log full message in debug output', () => {
    const event = createMockSnsEvent();
    const context = createMockContext();

    logSnsEvent(event, context);

    expect(debugOutput).toHaveLength(1);
    const recordData = expectStructured(
      debugOutput[0],
      'SNS Record Full Message test-function:test-request-id-123:sns-msg-123'
    );
    expect(recordData.message).toBe(JSON.stringify({ userId: 123, event: 'user-created' }));
  });

  it('should handle an empty batch', () => {
    const context = createMockContext();

    logSnsEvent({ Records: [] }, context);

    expect(infoOutput).toHaveLength(1);
    expect(debugOutput).toHaveLength(0);
    const [eventData] = infoOutput[0];
    expect(eventData.recordCount).toBe(0);
    expect(eventData.topicArn).toBeUndefined();
  });
});

describe('logEventBridgeEvent', () => {
  it('should log EventBridge event info as a structured object', () => {
    const event = createMockEventBridgeEvent();
    const context = createMockContext();

    logEventBridgeEvent(event, context);

    expect(infoOutput).toHaveLength(1);
    const logData = expectStructured(infoOutput[0], 'Entry EventBridge test-function:event-123');
    expect(logData.eventType).toBeUndefined();
    expect(logData.eventId).toBe('event-123');
    expect(logData.eventVersion).toBe('0');
    expect(logData.eventTime).toBe('2025-12-08T10:00:00Z');
    expect(logData.eventSource).toBe('aws.events');
    expect(logData.detailType).toBe('Scheduled Event');
    expect(logData.region).toBe('us-east-1');
    expect(logData.account).toBe('123456789012');
    expect(logData.detailKeys).toBe('scheduledTime, cronExpression');
  });

  it('should log full detail in debug output', () => {
    const event = createMockEventBridgeEvent();
    const context = createMockContext();

    logEventBridgeEvent(event, context);

    expect(debugOutput).toHaveLength(1);
    const detail = expectStructured(debugOutput[0], 'EventBridge Detail test-function:event-123');
    expect(detail).toEqual({
      scheduledTime: '2025-12-08T10:00:00Z',
      cronExpression: 'cron(0 10 * * ? *)',
    });
  });

  it('should handle an event without detail', () => {
    const event = createMockEventBridgeEvent();
    event.detail = undefined as any;
    const context = createMockContext();

    logEventBridgeEvent(event, context);

    const [logData] = infoOutput[0];
    expect(logData.detailKeys).toBe('');
    expect(debugOutput[0][0]).toBeUndefined();
  });
});

const createMockS3Event = (): S3Event => ({
  Records: [
    {
      eventVersion: '2.1',
      eventSource: 'aws:s3',
      awsRegion: 'us-east-1',
      eventTime: '2025-12-08T10:00:00.000Z',
      eventName: 'ObjectCreated:Put',
      userIdentity: {
        principalId: 'AWS:AIDAI123456789',
      },
      requestParameters: {
        sourceIPAddress: '192.168.1.1',
      },
      responseElements: {
        'x-amz-request-id': 's3-request-123',
        'x-amz-id-2': 'id-2-value',
      },
      s3: {
        s3SchemaVersion: '1.0',
        configurationId: 'test-config',
        bucket: {
          name: 'my-bucket',
          ownerIdentity: {
            principalId: 'OWNER123',
          },
          arn: 'arn:aws:s3:::my-bucket',
        },
        object: {
          key: 'uploads/file.txt',
          size: 1024,
          eTag: 'abc123def456',
          versionId: 'version-1',
          sequencer: '00000000000000000000',
        },
      },
    },
  ],
});

const createMockDynamoDBStreamEvent = (): DynamoDBStreamEvent => ({
  Records: [
    {
      eventID: 'ddb-event-123',
      eventName: 'INSERT',
      eventVersion: '1.1',
      eventSource: 'aws:dynamodb',
      awsRegion: 'us-east-1',
      dynamodb: {
        ApproximateCreationDateTime: 1702000000,
        Keys: {
          id: { S: 'user-123' },
        },
        NewImage: {
          id: { S: 'user-123' },
          name: { S: 'John Doe' },
          email: { S: 'john@example.com' },
        },
        SequenceNumber: '111111111111111111111',
        SizeBytes: 256,
        StreamViewType: 'NEW_AND_OLD_IMAGES',
      },
      eventSourceARN:
        'arn:aws:dynamodb:us-east-1:123456789012:table/users/stream/2025-12-08T10:00:00.000',
    },
  ],
});

describe('logS3Event', () => {
  it('should log S3 event info as structured objects', () => {
    const event = createMockS3Event();
    const context = createMockContext();

    logS3Event(event, context);

    // Should have 2 info logs: 1 general + 1 per record
    expect(infoOutput).toHaveLength(2);

    // Validate general event log
    const eventData = expectStructured(
      infoOutput[0],
      'Entry S3 Event test-function:test-request-id-123'
    );
    expect(eventData.eventType).toBeUndefined();
    expect(eventData.recordCount).toBe(1);
    expect(eventData.bucketName).toBe('my-bucket');

    // Validate individual record log
    const recordData = expectStructured(
      infoOutput[1],
      'S3 Record test-function:test-request-id-123:s3-request-123'
    );
    expect(recordData.bucketName).toBe('my-bucket');
    expect(recordData.bucketArn).toBe('arn:aws:s3:::my-bucket');
    expect(recordData.objectKey).toBe('uploads/file.txt');
    expect(recordData.requestId).toBe('s3-request-123');
    expect(recordData.sourceIp).toBe('192.168.1.1');
  });

  it('should decode S3 object key', () => {
    const event = createMockS3Event();
    event.Records[0].s3.object.key = 'uploads/my+file+with+spaces.txt';
    const context = createMockContext();

    logS3Event(event, context);

    const [recordData] = infoOutput[1];
    expect(recordData.objectKey).toBe('uploads/my file with spaces.txt');
  });

  it('should include object details', () => {
    const event = createMockS3Event();
    const context = createMockContext();

    logS3Event(event, context);

    const [recordData] = infoOutput[1];
    expect(recordData.eventName).toBe('ObjectCreated:Put');
    expect(recordData.objectSize).toBe(1024);
    expect(recordData.objectETag).toBe('abc123def456');
    expect(recordData.objectVersionId).toBe('version-1');
  });

  it('should fall back to "unknown" when responseElements are missing', () => {
    const event = createMockS3Event();
    delete (event.Records[0] as any).responseElements;
    const context = createMockContext();

    logS3Event(event, context);

    const recordData = expectStructured(
      infoOutput[1],
      'S3 Record test-function:test-request-id-123:unknown'
    );
    expect(recordData.requestId).toBe('unknown');
  });

  it('should not emit debug records', () => {
    logS3Event(createMockS3Event(), createMockContext());

    expect(debugOutput).toHaveLength(0);
  });

  it('should handle an empty batch', () => {
    const context = createMockContext();

    logS3Event({ Records: [] }, context);

    expect(infoOutput).toHaveLength(1);
    const [eventData] = infoOutput[0];
    expect(eventData.recordCount).toBe(0);
    expect(eventData.bucketName).toBeUndefined();
  });
});

describe('logDynamoDBStreamEvent', () => {
  it('should log DynamoDB Stream event info as structured objects', () => {
    const event = createMockDynamoDBStreamEvent();
    const context = createMockContext();

    logDynamoDBStreamEvent(event, context);

    // Should have 2 info logs: 1 general + 1 per record
    expect(infoOutput).toHaveLength(2);

    // Validate general event log
    const eventData = expectStructured(
      infoOutput[0],
      'Entry DynamoDB Stream Event test-function:test-request-id-123'
    );
    expect(eventData.eventType).toBeUndefined();
    expect(eventData.recordCount).toBe(1);

    // Validate individual record log
    const recordData = expectStructured(
      infoOutput[1],
      'DynamoDB Stream Record test-function:test-request-id-123:ddb-event-123'
    );
    expect(recordData.eventName).toBe('INSERT');
    expect(recordData.eventID).toBe('ddb-event-123');
    expect(recordData.eventVersion).toBe('1.1');
    expect(recordData.sequenceNumber).toBe('111111111111111111111');
    expect(recordData.sizeBytes).toBe(256);
    expect(recordData.streamViewType).toBe('NEW_AND_OLD_IMAGES');
  });

  it('should show keys as string in info output', () => {
    const event = createMockDynamoDBStreamEvent();
    const context = createMockContext();

    logDynamoDBStreamEvent(event, context);

    const [recordData] = infoOutput[1];
    expect(recordData.keys).toBe('id');
    expect(recordData.newImageKeys).toBe('id, name, email');
    expect(recordData.oldImageKeys).toBeUndefined();
  });

  it('should show full data in debug output', () => {
    const event = createMockDynamoDBStreamEvent();
    const context = createMockContext();

    logDynamoDBStreamEvent(event, context);

    expect(debugOutput).toHaveLength(1);
    const recordData = expectStructured(
      debugOutput[0],
      'DynamoDB Stream Full Data test-function:test-request-id-123:ddb-event-123'
    );
    expect(typeof recordData.keys).toBe('object');
    expect(recordData.keys).toHaveProperty('id');
    expect(typeof recordData.newImage).toBe('object');
    expect(recordData.newImage).toHaveProperty('id');
    expect(recordData.newImage).toHaveProperty('name');
  });

  it('should extract table name from ARN', () => {
    const event = createMockDynamoDBStreamEvent();
    const context = createMockContext();

    logDynamoDBStreamEvent(event, context);

    const [eventData] = infoOutput[0];
    expect(eventData.tableName).toBe('users');
    const [recordData] = infoOutput[1];
    expect(recordData.tableName).toBe('users');
  });

  it('should handle a record without dynamodb payload or ARN', () => {
    const event = createMockDynamoDBStreamEvent();
    delete (event.Records[0] as any).dynamodb;
    delete (event.Records[0] as any).eventSourceARN;
    const context = createMockContext();

    logDynamoDBStreamEvent(event, context);

    const [eventData] = infoOutput[0];
    expect(eventData.tableName).toBeUndefined();
    expect(eventData.streamArn).toBeUndefined();

    const [recordData] = infoOutput[1];
    expect(recordData.keys).toBe('');
    expect(recordData.newImageKeys).toBeUndefined();
    expect(recordData.sequenceNumber).toBeUndefined();
  });
});

const createMockAppSyncEvent = <TArgs = Record<string, any>, TSource = Record<string, any>>(
  overrides: Partial<AppSyncResolverEvent<TArgs, TSource>> = {}
): AppSyncResolverEvent<TArgs, TSource> => ({
  arguments: { id: 'user-123' } as TArgs,
  identity: {
    sub: 'cognito-user-id-456',
    issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_xxx',
    username: 'testuser',
    claims: {},
    sourceIp: ['192.168.1.1'],
    defaultAuthStrategy: 'ALLOW',
  } as any,
  source: null as TSource,
  request: {
    headers: {
      authorization: 'Bearer token123',
      'content-type': 'application/json',
    },
    domainName: null,
  },
  info: {
    fieldName: 'getUser',
    parentTypeName: 'Query',
    selectionSetList: ['id', 'name', 'email'],
    selectionSetGraphQL: '{ id name email }',
    variables: {},
  },
  prev: null,
  stash: {},
  ...overrides,
});

describe('logAppSyncEvent', () => {
  it('should log AppSync Query resolver event as a structured object', () => {
    const event = createMockAppSyncEvent();
    const context = createMockContext();

    logAppSyncEvent(event, context);

    expect(infoOutput).toHaveLength(1);
    const data = expectStructured(infoOutput[0], 'Entry AppSync test-function:test-request-id-123');
    expect(data.operation).toBe('Query');
    expect(data.fieldName).toBe('getUser');
    expect(data.identity).toBe('cognito-user-id-456');
    expect(data.identityType).toBe('Cognito');
    expect(data.argumentKeys).toContain('id');
    expect(data.hasSource).toBe(false);
    expect(data.sourceKeys).toBeUndefined();
  });

  it('should log AppSync Mutation resolver event', () => {
    const event = createMockAppSyncEvent({
      info: {
        fieldName: 'createUser',
        parentTypeName: 'Mutation',
        selectionSetList: ['id', 'name'],
        selectionSetGraphQL: '{ id name }',
        variables: {},
      },
      arguments: { input: { name: 'John', email: 'john@example.com' } },
    });
    const context = createMockContext();

    logAppSyncEvent(event, context);

    const [data] = infoOutput[0];
    expect(data.operation).toBe('Mutation');
    expect(data.fieldName).toBe('createUser');
    expect(data.argumentKeys).toContain('input');
  });

  it('should log field resolver with source', () => {
    const event = createMockAppSyncEvent({
      info: {
        fieldName: 'author',
        parentTypeName: 'Post',
        selectionSetList: ['id', 'name'],
        selectionSetGraphQL: '{ id name }',
        variables: {},
      },
      source: { id: 'post-123', title: 'Test Post', authorId: 'author-456' } as any,
      arguments: {} as any,
    });
    const context = createMockContext();

    logAppSyncEvent(event, context);

    const [data] = infoOutput[0];
    expect(data.operation).toBe('Post');
    expect(data.fieldName).toBe('author');
    expect(data.hasSource).toBe(true);
    expect(data.sourceKeys).toContain('id');
    expect(data.sourceKeys).toContain('authorId');
  });

  it('should log anonymous identity when no identity', () => {
    const event = createMockAppSyncEvent({
      identity: null as any,
    });
    const context = createMockContext();

    logAppSyncEvent(event, context);

    const [data] = infoOutput[0];
    expect(data.identity).toBe('anonymous');
    expect(data.identityType).toBe('none');
  });

  it('should detect IAM and API_KEY identity types', () => {
    const context = createMockContext();

    logAppSyncEvent(
      createMockAppSyncEvent({ identity: { accountId: '123456789012' } as any }),
      context
    );
    expect(infoOutput[0][0].identityType).toBe('IAM');

    logAppSyncEvent(createMockAppSyncEvent({ identity: {} as any }), context);
    expect(infoOutput[1][0].identityType).toBe('API_KEY');
  });

  it('should log full data in debug output', () => {
    const event = createMockAppSyncEvent({
      stash: { cachedValue: 'test' },
    });
    const context = createMockContext();

    logAppSyncEvent(event, context);

    expect(debugOutput).toHaveLength(1);
    const data = expectStructured(
      debugOutput[0],
      'AppSync Full Data test-function:test-request-id-123'
    );
    expect(data.arguments).toHaveProperty('id');
    expect(data.requestHeaders).toHaveProperty('authorization');
    expect(data.stash).toHaveProperty('cachedValue');
  });

  it('should include additional data in log', () => {
    const event = createMockAppSyncEvent();
    const context = createMockContext();

    logAppSyncEvent(event, context, {
      additionalData: { correlationId: 'corr-123' },
    });

    const [data] = infoOutput[0];
    expect(data.correlationId).toBe('corr-123');
  });

  it('should log selectionSetList', () => {
    const event = createMockAppSyncEvent();
    const context = createMockContext();

    logAppSyncEvent(event, context);

    const [data] = infoOutput[0];
    expect(data.selectionSetList).toEqual(['id', 'name', 'email']);
  });
});

describe('structured logging contract', () => {
  it('should resolve the logger on every call instead of caching it at import time', () => {
    const first: LogCall[] = [];
    const second: LogCall[] = [];
    const context = createMockContext();

    setLogger({
      info: (obj: unknown, msg?: string) => {
        first.push([obj, msg]);
      },
      debug: () => {},
      warn: () => {},
      error: () => {},
    });
    logApiGatewayEvent(createMockApiGatewayEvent(), context);

    setLogger({
      info: (obj: unknown, msg?: string) => {
        second.push([obj, msg]);
      },
      debug: () => {},
      warn: () => {},
      error: () => {},
    });
    logApiGatewayEvent(createMockApiGatewayEvent(), context);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
  });

  describe('with the default logger', () => {
    let lines: string[];
    let consoleInfoSpy: jest.SpyInstance;
    let consoleDebugSpy: jest.SpyInstance;
    let consoleLogSpy: jest.SpyInstance;

    beforeEach(() => {
      resetLogger();
      // The headers record is DEBUG, which the INFO default now drops; this block is about
      // the shape of the emitted line, so it asks for the level that produces both.
      setLogLevel('debug');
      lines = [];
      setLogSink((line) => lines.push(line));
      consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
      consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      resetLogLevel();
      consoleInfoSpy.mockRestore();
      consoleDebugSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });

    it('should emit one JSON line per record with top-level indexable fields', () => {
      logApiGatewayEvent(createMockApiGatewayEvent(), createMockContext());

      expect(lines).toHaveLength(2);
      const record = JSON.parse(lines[0]);
      expect(record.level).toBe('INFO');
      expect(record.msg).toBe('Entry API Gateway test-function:api-request-id');
      // Fields are at the top level, so `filter requestId = '...'` works in Logs Insights.
      expect(record.requestId).toBe('test-request-id-123');
      expect(record.httpMethod).toBe('GET');
      expect(record.path).toBe('/users/123');
      expect(record.sourceIp).toBe('192.168.1.1');
      expect(record.queryStringParameters).toEqual({ page: '1', limit: '10' });

      const debugRecord = JSON.parse(lines[1]);
      expect(debugRecord.level).toBe('DEBUG');
      expect(debugRecord.msg).toBe('API Gateway Headers test-function:api-request-id');
      expect(debugRecord['user-agent']).toBe('Mozilla/5.0');
    });

    it('should never write through console.* (Advanced Logging Controls channel)', () => {
      const context = createMockContext();

      logApiGatewayEvent(createMockApiGatewayEvent(), context);
      logApiGatewayEventV2(createMockApiGatewayEventV2(), context);
      logSqsEvent(createMockSqsEvent(), context);
      logSnsEvent(createMockSnsEvent(), context);
      logEventBridgeEvent(createMockEventBridgeEvent(), context);
      logS3Event(createMockS3Event(), context);
      logDynamoDBStreamEvent(createMockDynamoDBStreamEvent(), context);
      logAppSyncEvent(createMockAppSyncEvent(), context);

      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
        expect(line).not.toContain('\n');
      }
    });

    it('should keep record fields indexable for batch sources', () => {
      logSqsEvent(createMockSqsEvent(), createMockContext());

      const recordLine = JSON.parse(lines[1]);
      expect(recordLine.level).toBe('INFO');
      expect(recordLine.msg).toBe('SQS Record test-function:test-request-id-123:msg-123');
      expect(recordLine.messageId).toBe('msg-123');
      expect(recordLine.recordIndex).toBe(1);
      expect(recordLine.totalRecords).toBe(1);
    });
  });
});
