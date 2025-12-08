import { 
  APIGatewayProxyEvent, 
  SQSEvent, 
  SNSEvent, 
  EventBridgeEvent,
  S3Event,
  DynamoDBStreamEvent,
  Context 
} from 'aws-lambda';
import {
  logApiGatewayEvent,
  logSqsEvent,
  logSnsEvent,
  logEventBridgeEvent,
  logS3Event,
  logDynamoDBStreamEvent,
  LogLevel,
} from './logLambdaEvent';

// Mock console.info
const originalConsoleInfo = console.info;
let consoleOutput: any[] = [];

beforeEach(() => {
  consoleOutput = [];
  console.info = jest.fn((...args) => {
    consoleOutput.push(args);
  });
  delete process.env.LOG_LEVEL;
});

afterEach(() => {
  console.info = originalConsoleInfo;
});

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

const createMockSqsEvent = (): SQSEvent => ({
  Records: [
    {
      messageId: 'msg-123',
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
    },
  ],
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
  it('should log API Gateway event with INFO level', () => {
    process.env.LOG_LEVEL = 'info';
    const event = createMockApiGatewayEvent();
    const context = createMockContext();

    logApiGatewayEvent(event, context);

    expect(consoleOutput).toHaveLength(1);
    const [message, logData] = consoleOutput[0];
    expect(message).toBe('Entry API Gateway test-function:api-request-id');
    expect(logData.eventType).toBeUndefined();
    expect(logData.requestId).toBe('test-request-id-123');
    expect(logData.httpMethod).toBe('GET');
    expect(logData.path).toBe('/users/123');
    expect(logData.stage).toBe('prod');
    expect(logData.sourceIp).toBe('192.168.1.1');
  });

  it('should not log when LOG_LEVEL is none', () => {
    process.env.LOG_LEVEL = 'none';
    const event = createMockApiGatewayEvent();
    const context = createMockContext();

    logApiGatewayEvent(event, context);

    expect(consoleOutput).toHaveLength(0);
  });

  it('should include all headers in DEBUG mode', () => {
    process.env.LOG_LEVEL = 'debug';
    const event = createMockApiGatewayEvent();
    const context = createMockContext();

    logApiGatewayEvent(event, context);

    const [, logData] = consoleOutput[0];
    expect(logData.headers).toHaveProperty('user-agent');
    expect(logData.headers).toHaveProperty('x-forwarded-for');
  });

  it('should include additional data when provided', () => {
    process.env.LOG_LEVEL = 'info';
    const event = createMockApiGatewayEvent();
    const context = createMockContext();

    logApiGatewayEvent(event, context, {
      additionalData: { customField: 'customValue' },
    });

    const [, logData] = consoleOutput[0];
    expect(logData.customField).toBe('customValue');
  });
});

describe('logSqsEvent', () => {
  it('should log SQS event with INFO level', () => {
    process.env.LOG_LEVEL = 'info';
    const event = createMockSqsEvent();
    const context = createMockContext();

    logSqsEvent(event, context);

    // Deve ter 2 logs: 1 geral + 1 por record
    expect(consoleOutput).toHaveLength(2);
    
    // Validar log geral do evento
    const [eventMessage, eventData] = consoleOutput[0];
    expect(eventMessage).toBe('Entry SQS Event test-function:test-request-id-123');
    expect(eventData.eventType).toBeUndefined();
    expect(eventData.recordCount).toBe(1);
    
    // Validar log do record individual
    const [recordMessage, recordData] = consoleOutput[1];
    expect(recordMessage).toBe('SQS Record test-function:test-request-id-123:msg-123');
    expect(recordData.messageId).toBe('msg-123');
    expect(recordData.recordIndex).toBe(1);
    expect(recordData.totalRecords).toBe(1);
  });

  it('should truncate body in INFO mode', () => {
    process.env.LOG_LEVEL = 'info';
    const event = createMockSqsEvent();
    const context = createMockContext();

    logSqsEvent(event, context);

    const [, recordData] = consoleOutput[1];
    expect(recordData.body).toContain('...');
  });

  it('should include full body in DEBUG mode', () => {
    process.env.LOG_LEVEL = 'debug';
    const event = createMockSqsEvent();
    const context = createMockContext();

    logSqsEvent(event, context);

    const [, recordData] = consoleOutput[1];
    expect(recordData.body).toBe(JSON.stringify({ userId: 123, action: 'update' }));
  });
});

describe('logSnsEvent', () => {
  it('should log SNS event with INFO level', () => {
    process.env.LOG_LEVEL = 'info';
    const event = createMockSnsEvent();
    const context = createMockContext();

    logSnsEvent(event, context);

    // Deve ter 2 logs: 1 geral + 1 por record
    expect(consoleOutput).toHaveLength(2);
    
    // Validar log geral do evento
    const [eventMessage, eventData] = consoleOutput[0];
    expect(eventMessage).toBe('Entry SNS Event test-function:test-request-id-123');
    expect(eventData.eventType).toBeUndefined();
    expect(eventData.recordCount).toBe(1);
    
    // Validar log do record individual
    const [recordMessage, recordData] = consoleOutput[1];
    expect(recordMessage).toBe('SNS Record test-function:test-request-id-123:sns-msg-123');
    expect(recordData.messageId).toBe('sns-msg-123');
    expect(recordData.subject).toBe('User Created Event');
    expect(recordData.topicArn).toBe('arn:aws:sns:us-east-1:123456789012:my-topic');
  });

  it('should truncate message in INFO mode', () => {
    process.env.LOG_LEVEL = 'info';
    const event = createMockSnsEvent();
    const context = createMockContext();

    logSnsEvent(event, context);

    const [, recordData] = consoleOutput[1];
    expect(recordData.message).toContain('...');
  });

  it('should include full message in DEBUG mode', () => {
    process.env.LOG_LEVEL = 'debug';
    const event = createMockSnsEvent();
    const context = createMockContext();

    logSnsEvent(event, context);

    const [, recordData] = consoleOutput[1];
    expect(recordData.message).toBe(JSON.stringify({ userId: 123, event: 'user-created' }));
  });
});

describe('logEventBridgeEvent', () => {
  it('should log EventBridge event with INFO level', () => {
    process.env.LOG_LEVEL = 'info';
    const event = createMockEventBridgeEvent();
    const context = createMockContext();

    logEventBridgeEvent(event, context);

    expect(consoleOutput).toHaveLength(1);
    const [message, logData] = consoleOutput[0];
    expect(message).toBe('Entry EventBridge test-function:event-123');
    expect(logData.eventType).toBeUndefined();
    expect(logData.eventId).toBe('event-123');
    expect(logData.eventSource).toBe('aws.events');
    expect(logData.detailType).toBe('Scheduled Event');
  });

  it('should show detail keys in INFO mode', () => {
    process.env.LOG_LEVEL = 'info';
    const event = createMockEventBridgeEvent();
    const context = createMockContext();

    logEventBridgeEvent(event, context);

    const [, logData] = consoleOutput[0];
    expect(typeof logData.detail).toBe('string');
    expect(logData.detail).toContain('scheduledTime');
  });

  it('should show full detail in DEBUG mode', () => {
    process.env.LOG_LEVEL = 'debug';
    const event = createMockEventBridgeEvent();
    const context = createMockContext();

    logEventBridgeEvent(event, context);

    const [, logData] = consoleOutput[0];
    expect(typeof logData.detail).toBe('object');
    expect(logData.detail.scheduledTime).toBe('2025-12-08T10:00:00Z');
  });
});



describe('LogLevel environment variable', () => {
  it('should use custom environment variable name', () => {
    process.env.CUSTOM_LOG_LEVEL = 'none';
    const event = createMockApiGatewayEvent();
    const context = createMockContext();

    logApiGatewayEvent(event, context, {
      envVar: 'CUSTOM_LOG_LEVEL',
    });

    expect(consoleOutput).toHaveLength(0);
  });

  it('should use default level when env var not set', () => {
    const event = createMockApiGatewayEvent();
    const context = createMockContext();

    logApiGatewayEvent(event, context, {
      defaultLevel: LogLevel.NONE,
    });

    expect(consoleOutput).toHaveLength(0);
  });

  it('should fallback to INFO when invalid level provided', () => {
    process.env.LOG_LEVEL = 'invalid';
    const event = createMockApiGatewayEvent();
    const context = createMockContext();

    logApiGatewayEvent(event, context);

    expect(consoleOutput).toHaveLength(1);
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
      eventSourceARN: 'arn:aws:dynamodb:us-east-1:123456789012:table/users/stream/2025-12-08T10:00:00.000',
    },
  ],
});

describe('logS3Event', () => {
  it('should log S3 event with INFO level', () => {
    process.env.LOG_LEVEL = 'info';
    const event = createMockS3Event();
    const context = createMockContext();

    logS3Event(event, context);

    // Deve ter 2 logs: 1 geral + 1 por record
    expect(consoleOutput).toHaveLength(2);
    
    // Validar log geral do evento
    const [eventMessage, eventData] = consoleOutput[0];
    expect(eventMessage).toBe('Entry S3 Event test-function:test-request-id-123');
    expect(eventData.eventType).toBeUndefined();
    expect(eventData.recordCount).toBe(1);
    
    // Validar log do record individual
    const [recordMessage, recordData] = consoleOutput[1];
    expect(recordMessage).toBe('S3 Record test-function:test-request-id-123:s3-request-123');
    expect(recordData.bucketName).toBe('my-bucket');
    expect(recordData.objectKey).toBe('uploads/file.txt');
  });

  it('should decode S3 object key', () => {
    process.env.LOG_LEVEL = 'info';
    const event = createMockS3Event();
    event.Records[0].s3.object.key = 'uploads/my+file+with+spaces.txt';
    const context = createMockContext();

    logS3Event(event, context);

    const [, recordData] = consoleOutput[1];
    expect(recordData.objectKey).toBe('uploads/my file with spaces.txt');
  });

  it('should include object details', () => {
    process.env.LOG_LEVEL = 'info';
    const event = createMockS3Event();
    const context = createMockContext();

    logS3Event(event, context);

    const [, recordData] = consoleOutput[1];
    expect(recordData.eventName).toBe('ObjectCreated:Put');
    expect(recordData.objectSize).toBe(1024);
    expect(recordData.objectETag).toBe('abc123def456');
  });
});

describe('logDynamoDBStreamEvent', () => {
  it('should log DynamoDB Stream event with INFO level', () => {
    process.env.LOG_LEVEL = 'info';
    const event = createMockDynamoDBStreamEvent();
    const context = createMockContext();

    logDynamoDBStreamEvent(event, context);

    // Deve ter 2 logs: 1 geral + 1 por record
    expect(consoleOutput).toHaveLength(2);
    
    // Validar log geral do evento
    const [eventMessage, eventData] = consoleOutput[0];
    expect(eventMessage).toBe('Entry DynamoDB Stream Event test-function:test-request-id-123');
    expect(eventData.eventType).toBeUndefined();
    expect(eventData.recordCount).toBe(1);
    
    // Validar log do record individual
    const [recordMessage, recordData] = consoleOutput[1];
    expect(recordMessage).toBe('DynamoDB Stream Record test-function:test-request-id-123:ddb-event-123');
    expect(recordData.eventName).toBe('INSERT');
  });

  it('should show keys as string in INFO mode', () => {
    process.env.LOG_LEVEL = 'info';
    const event = createMockDynamoDBStreamEvent();
    const context = createMockContext();

    logDynamoDBStreamEvent(event, context);

    const [, recordData] = consoleOutput[1];
    expect(typeof recordData.keys).toBe('string');
    expect(recordData.keys).toBe('id');
    expect(typeof recordData.newImage).toBe('string');
    expect(recordData.newImage).toContain('id');
  });

  it('should show full data in DEBUG mode', () => {
    process.env.LOG_LEVEL = 'debug';
    const event = createMockDynamoDBStreamEvent();
    const context = createMockContext();

    logDynamoDBStreamEvent(event, context);

    const [, recordData] = consoleOutput[1];
    expect(typeof recordData.keys).toBe('object');
    expect(recordData.keys).toHaveProperty('id');
    expect(typeof recordData.newImage).toBe('object');
    expect(recordData.newImage).toHaveProperty('id');
    expect(recordData.newImage).toHaveProperty('name');
  });

  it('should extract table name from ARN', () => {
    process.env.LOG_LEVEL = 'info';
    const event = createMockDynamoDBStreamEvent();
    const context = createMockContext();

    logDynamoDBStreamEvent(event, context);

    const [, eventData] = consoleOutput[0];
    expect(eventData.tableName).toBe('users');
    const [, recordData] = consoleOutput[1];
    expect(recordData.tableName).toBe('users');
  });
});
