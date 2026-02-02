import { 
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  SQSEvent, 
  SNSEvent, 
  EventBridgeEvent,
  S3Event,
  DynamoDBStreamEvent,
  AppSyncResolverEvent,
  Context 
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
} from './logLambdaEvent';

// Mock console methods
const originalConsoleInfo = console.info;
const originalConsoleDebug = console.debug;
let consoleInfoOutput: any[] = [];
let consoleDebugOutput: any[] = [];

beforeEach(() => {
  consoleInfoOutput = [];
  consoleDebugOutput = [];
  console.info = jest.fn((...args) => {
    consoleInfoOutput.push(args);
  });
  console.debug = jest.fn((...args) => {
    consoleDebugOutput.push(args);
  });
});

afterEach(() => {
  console.info = originalConsoleInfo;
  console.debug = originalConsoleDebug;
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
  it('should log API Gateway event info', () => {
    const event = createMockApiGatewayEvent();
    const context = createMockContext();

    logApiGatewayEvent(event, context);

    expect(consoleInfoOutput).toHaveLength(1);
    const [message, logData] = consoleInfoOutput[0];
    expect(message).toBe('Entry API Gateway test-function:api-request-id');
    expect(logData.eventType).toBeUndefined();
    expect(logData.requestId).toBe('test-request-id-123');
    expect(logData.httpMethod).toBe('GET');
    expect(logData.path).toBe('/users/123');
    expect(logData.stage).toBe('prod');
    expect(logData.sourceIp).toBe('192.168.1.1');
  });

  it('should log all headers in debug output', () => {
    const event = createMockApiGatewayEvent();
    const context = createMockContext();

    logApiGatewayEvent(event, context);

    expect(consoleDebugOutput).toHaveLength(1);
    const [message, headers] = consoleDebugOutput[0];
    expect(message).toBe('API Gateway Headers test-function:api-request-id');
    expect(headers).toHaveProperty('user-agent');
    expect(headers).toHaveProperty('x-forwarded-for');
  });

  it('should include additional data when provided', () => {
    const event = createMockApiGatewayEvent();
    const context = createMockContext();

    logApiGatewayEvent(event, context, {
      additionalData: { customField: 'customValue' },
    });

    const [, logData] = consoleInfoOutput[0];
    expect(logData.customField).toBe('customValue');
  });
});

describe('logApiGatewayEventV2', () => {
  it('should log API Gateway V2 event info', () => {
    const event = createMockApiGatewayEventV2();
    const context = createMockContext();

    logApiGatewayEventV2(event, context);

    expect(consoleInfoOutput).toHaveLength(1);
    const [message, logData] = consoleInfoOutput[0];
    expect(message).toBe('Entry API Gateway V2 test-function:api-request-id-v2');
    expect(logData.requestId).toBe('test-request-id-123');
    expect(logData.httpMethod).toBe('GET');
    expect(logData.path).toBe('/users/123');
    expect(logData.routeKey).toBe('GET /users/{id}');
    expect(logData.stage).toBe('prod');
    expect(logData.sourceIp).toBe('192.168.1.1');
    expect(logData.userAgent).toBe('Mozilla/5.0');
    expect(logData.requestTimeEpoch).toBe(1702000000000);
    expect(logData.cookies).toEqual(['session=abc123']);
  });

  it('should log all headers in debug output', () => {
    const event = createMockApiGatewayEventV2();
    const context = createMockContext();

    logApiGatewayEventV2(event, context);

    expect(consoleDebugOutput).toHaveLength(1);
    const [message, headers] = consoleDebugOutput[0];
    expect(message).toBe('API Gateway V2 Headers test-function:api-request-id-v2');
    expect(headers).toHaveProperty('user-agent');
    expect(headers).toHaveProperty('x-forwarded-for');
  });

  it('should include additional data when provided', () => {
    const event = createMockApiGatewayEventV2();
    const context = createMockContext();

    logApiGatewayEventV2(event, context, {
      additionalData: { customField: 'customValue' },
    });

    const [, logData] = consoleInfoOutput[0];
    expect(logData.customField).toBe('customValue');
  });

  it('should handle missing cookies', () => {
    const event = createMockApiGatewayEventV2();
    event.cookies = undefined;
    const context = createMockContext();

    logApiGatewayEventV2(event, context);

    const [, logData] = consoleInfoOutput[0];
    expect(logData.cookies).toBeUndefined();
  });
});

describe('logSqsEvent', () => {
  it('should log SQS event info', () => {
    const event = createMockSqsEvent();
    const context = createMockContext();

    logSqsEvent(event, context);

    // Should have 2 info logs: 1 general + 1 per record
    expect(consoleInfoOutput).toHaveLength(2);
    
    // Validate general event log
    const [eventMessage, eventData] = consoleInfoOutput[0];
    expect(eventMessage).toBe('Entry SQS Event test-function:test-request-id-123');
    expect(eventData.eventType).toBeUndefined();
    expect(eventData.recordCount).toBe(1);
    
    // Validate individual record log
    const [recordMessage, recordData] = consoleInfoOutput[1];
    expect(recordMessage).toBe('SQS Record test-function:test-request-id-123:msg-123');
    expect(recordData.messageId).toBe('msg-123');
    expect(recordData.recordIndex).toBe(1);
    expect(recordData.totalRecords).toBe(1);
  });

  it('should log full body in debug output', () => {
    const event = createMockSqsEvent();
    const context = createMockContext();

    logSqsEvent(event, context);

    expect(consoleDebugOutput).toHaveLength(1);
    const [message, recordData] = consoleDebugOutput[0];
    expect(message).toBe('SQS Record Full Body test-function:test-request-id-123:msg-123');
    expect(recordData.body).toBe(JSON.stringify({ userId: 123, action: 'update' }));
    expect(recordData.receiptHandle).toBe('receipt-handle-xyz');
  });
});

describe('logSnsEvent', () => {
  it('should log SNS event info', () => {
    const event = createMockSnsEvent();
    const context = createMockContext();

    logSnsEvent(event, context);

    // Should have 2 info logs: 1 general + 1 per record
    expect(consoleInfoOutput).toHaveLength(2);
    
    // Validate general event log
    const [eventMessage, eventData] = consoleInfoOutput[0];
    expect(eventMessage).toBe('Entry SNS Event test-function:test-request-id-123');
    expect(eventData.eventType).toBeUndefined();
    expect(eventData.recordCount).toBe(1);
    
    // Validate individual record log
    const [recordMessage, recordData] = consoleInfoOutput[1];
    expect(recordMessage).toBe('SNS Record test-function:test-request-id-123:sns-msg-123');
    expect(recordData.messageId).toBe('sns-msg-123');
    expect(recordData.subject).toBe('User Created Event');
    expect(recordData.topicArn).toBe('arn:aws:sns:us-east-1:123456789012:my-topic');
  });

  it('should log full message in debug output', () => {
    const event = createMockSnsEvent();
    const context = createMockContext();

    logSnsEvent(event, context);

    expect(consoleDebugOutput).toHaveLength(1);
    const [message, recordData] = consoleDebugOutput[0];
    expect(message).toBe('SNS Record Full Message test-function:test-request-id-123:sns-msg-123');
    expect(recordData.message).toBe(JSON.stringify({ userId: 123, event: 'user-created' }));
  });
});

describe('logEventBridgeEvent', () => {
  it('should log EventBridge event info', () => {
    const event = createMockEventBridgeEvent();
    const context = createMockContext();

    logEventBridgeEvent(event, context);

    expect(consoleInfoOutput).toHaveLength(1);
    const [message, logData] = consoleInfoOutput[0];
    expect(message).toBe('Entry EventBridge test-function:event-123');
    expect(logData.eventType).toBeUndefined();
    expect(logData.eventId).toBe('event-123');
    expect(logData.eventSource).toBe('aws.events');
    expect(logData.detailType).toBe('Scheduled Event');
    expect(logData.detailKeys).toBe('scheduledTime, cronExpression');
  });

  it('should log full detail in debug output', () => {
    const event = createMockEventBridgeEvent();
    const context = createMockContext();

    logEventBridgeEvent(event, context);

    expect(consoleDebugOutput).toHaveLength(1);
    const [message, logData] = consoleDebugOutput[0];
    expect(message).toBe('EventBridge Detail test-function:event-123');
    expect(logData).toEqual({
      scheduledTime: '2025-12-08T10:00:00Z',
      cronExpression: 'cron(0 10 * * ? *)',
    });
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
  it('should log S3 event info', () => {
    const event = createMockS3Event();
    const context = createMockContext();

    logS3Event(event, context);

    // Should have 2 info logs: 1 general + 1 per record
    expect(consoleInfoOutput).toHaveLength(2);
    
    // Validate general event log
    const [eventMessage, eventData] = consoleInfoOutput[0];
    expect(eventMessage).toBe('Entry S3 Event test-function:test-request-id-123');
    expect(eventData.eventType).toBeUndefined();
    expect(eventData.recordCount).toBe(1);
    
    // Validate individual record log
    const [recordMessage, recordData] = consoleInfoOutput[1];
    expect(recordMessage).toBe('S3 Record test-function:test-request-id-123:s3-request-123');
    expect(recordData.bucketName).toBe('my-bucket');
    expect(recordData.objectKey).toBe('uploads/file.txt');
  });

  it('should decode S3 object key', () => {
    const event = createMockS3Event();
    event.Records[0].s3.object.key = 'uploads/my+file+with+spaces.txt';
    const context = createMockContext();

    logS3Event(event, context);

    const [, recordData] = consoleInfoOutput[1];
    expect(recordData.objectKey).toBe('uploads/my file with spaces.txt');
  });

  it('should include object details', () => {
    const event = createMockS3Event();
    const context = createMockContext();

    logS3Event(event, context);

    const [, recordData] = consoleInfoOutput[1];
    expect(recordData.eventName).toBe('ObjectCreated:Put');
    expect(recordData.objectSize).toBe(1024);
    expect(recordData.objectETag).toBe('abc123def456');
  });
});

describe('logDynamoDBStreamEvent', () => {
  it('should log DynamoDB Stream event info', () => {
    const event = createMockDynamoDBStreamEvent();
    const context = createMockContext();

    logDynamoDBStreamEvent(event, context);

    // Should have 2 info logs: 1 general + 1 per record
    expect(consoleInfoOutput).toHaveLength(2);
    
    // Validate general event log
    const [eventMessage, eventData] = consoleInfoOutput[0];
    expect(eventMessage).toBe('Entry DynamoDB Stream Event test-function:test-request-id-123');
    expect(eventData.eventType).toBeUndefined();
    expect(eventData.recordCount).toBe(1);
    
    
    // Validate individual record log
    const [recordMessage, recordData] = consoleInfoOutput[1];
    expect(recordMessage).toBe('DynamoDB Stream Record test-function:test-request-id-123:ddb-event-123');
    expect(recordData.eventName).toBe('INSERT');
  });

  it('should show keys as string in info output', () => {
    const event = createMockDynamoDBStreamEvent();
    const context = createMockContext();

    logDynamoDBStreamEvent(event, context);

    const [, recordData] = consoleInfoOutput[1];
    expect(recordData.keys).toBe('id');
    expect(recordData.newImageKeys).toBe('id, name, email');
  });

  it('should show full data in debug output', () => {
    const event = createMockDynamoDBStreamEvent();
    const context = createMockContext();

    logDynamoDBStreamEvent(event, context);

    expect(consoleDebugOutput).toHaveLength(1);
    const [message, recordData] = consoleDebugOutput[0];
    expect(message).toBe('DynamoDB Stream Full Data test-function:test-request-id-123:ddb-event-123');
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

    const [, eventData] = consoleInfoOutput[0];
    expect(eventData.tableName).toBe('users');
    const [, recordData] = consoleInfoOutput[1];
    expect(recordData.tableName).toBe('users');
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
      'authorization': 'Bearer token123',
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
  it('should log AppSync Query resolver event', () => {
    const event = createMockAppSyncEvent();
    const context = createMockContext();

    logAppSyncEvent(event, context);

    expect(consoleInfoOutput).toHaveLength(1);
    const [message, data] = consoleInfoOutput[0];
    expect(message).toBe('Entry AppSync test-function:test-request-id-123');
    expect(data.operation).toBe('Query');
    expect(data.fieldName).toBe('getUser');
    expect(data.identity).toBe('cognito-user-id-456');
    expect(data.identityType).toBe('Cognito');
    expect(data.argumentKeys).toContain('id');
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

    const [, data] = consoleInfoOutput[0];
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

    const [, data] = consoleInfoOutput[0];
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

    const [, data] = consoleInfoOutput[0];
    expect(data.identity).toBe('anonymous');
    expect(data.identityType).toBe('none');
  });

  it('should log full data in debug output', () => {
    const event = createMockAppSyncEvent({
      stash: { cachedValue: 'test' },
    });
    const context = createMockContext();

    logAppSyncEvent(event, context);

    expect(consoleDebugOutput).toHaveLength(1);
    const [message, data] = consoleDebugOutput[0];
    expect(message).toBe('AppSync Full Data test-function:test-request-id-123');
    expect(data.arguments).toHaveProperty('id');
    expect(data.requestHeaders).toHaveProperty('authorization');
    expect(data.stash).toHaveProperty('cachedValue');
  });

  it('should include additional data in log', () => {
    const event = createMockAppSyncEvent();
    const context = createMockContext();

    logAppSyncEvent(event, context, { 
      additionalData: { correlationId: 'corr-123' } 
    });

    const [, data] = consoleInfoOutput[0];
    expect(data.correlationId).toBe('corr-123');
  });

  it('should log selectionSetList', () => {
    const event = createMockAppSyncEvent();
    const context = createMockContext();

    logAppSyncEvent(event, context);

    const [, data] = consoleInfoOutput[0];
    expect(data.selectionSetList).toEqual(['id', 'name', 'email']);
  });
});
