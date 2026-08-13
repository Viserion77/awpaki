import {
  createMockContext,
  MOCK_AWS_REQUEST_ID,
  MOCK_CONTEXT_ACCOUNT_ID,
  MOCK_CONTEXT_REGION,
  MOCK_FUNCTION_NAME,
  MOCK_REMAINING_TIME_IN_MILLIS,
} from './create-mock-context.js';

describe('createMockContext', () => {
  it('builds a complete context with no overrides', () => {
    const context = createMockContext();

    expect(context).toMatchObject({
      callbackWaitsForEmptyEventLoop: true,
      functionName: MOCK_FUNCTION_NAME,
      functionVersion: '$LATEST',
      invokedFunctionArn: `arn:aws:lambda:${MOCK_CONTEXT_REGION}:${MOCK_CONTEXT_ACCOUNT_ID}:function:${MOCK_FUNCTION_NAME}`,
      memoryLimitInMB: '128',
      awsRequestId: MOCK_AWS_REQUEST_ID,
      logGroupName: `/aws/lambda/${MOCK_FUNCTION_NAME}`,
    });
    expect(context.logStreamName).toContain('[$LATEST]');
    expect(typeof context.getRemainingTimeInMillis).toBe('function');
  });

  it('returns the default remaining time', () => {
    expect(createMockContext().getRemainingTimeInMillis()).toBe(MOCK_REMAINING_TIME_IN_MILLIS);
    expect(MOCK_REMAINING_TIME_IN_MILLIS).toBe(30_000);
  });

  it('accepts a fixed remaining time in milliseconds', () => {
    const context = createMockContext({ getRemainingTimeInMillis: 250 });

    expect(context.getRemainingTimeInMillis()).toBe(250);
    expect(context.getRemainingTimeInMillis()).toBe(250);
  });

  it('accepts zero as the remaining time', () => {
    const context = createMockContext({ getRemainingTimeInMillis: 0 });

    expect(context.getRemainingTimeInMillis()).toBe(0);
  });

  it('accepts a function, so the budget can shrink between calls', () => {
    let remaining = 3_000;
    const context = createMockContext({
      getRemainingTimeInMillis: () => (remaining -= 1_000),
    });

    expect(context.getRemainingTimeInMillis()).toBe(2_000);
    expect(context.getRemainingTimeInMillis()).toBe(1_000);
    expect(context.getRemainingTimeInMillis()).toBe(0);
  });

  it('derives the arn and the log group from an overridden function name', () => {
    const context = createMockContext({ functionName: 'orders-api' });

    expect(context.functionName).toBe('orders-api');
    expect(context.invokedFunctionArn).toBe(
      `arn:aws:lambda:${MOCK_CONTEXT_REGION}:${MOCK_CONTEXT_ACCOUNT_ID}:function:orders-api`
    );
    expect(context.logGroupName).toBe('/aws/lambda/orders-api');
  });

  it('lets an explicit arn or log group win over the derived one', () => {
    const context = createMockContext({
      functionName: 'orders-api',
      invokedFunctionArn: 'arn:aws:lambda:sa-east-1:000000000000:function:other',
      logGroupName: '/custom/group',
    });

    expect(context.invokedFunctionArn).toBe('arn:aws:lambda:sa-east-1:000000000000:function:other');
    expect(context.logGroupName).toBe('/custom/group');
  });

  it('passes every other override through', () => {
    const context = createMockContext({
      callbackWaitsForEmptyEventLoop: false,
      functionVersion: '7',
      memoryLimitInMB: '1024',
      awsRequestId: 'req-1',
      logStreamName: 'stream-1',
      identity: { cognitoIdentityId: 'id-1', cognitoIdentityPoolId: 'pool-1' },
      clientContext: { client: {} as never, env: {} as never, custom: { app: 'mobile' } },
    });

    expect(context.callbackWaitsForEmptyEventLoop).toBe(false);
    expect(context.functionVersion).toBe('7');
    expect(context.memoryLimitInMB).toBe('1024');
    expect(context.awsRequestId).toBe('req-1');
    expect(context.logStreamName).toBe('stream-1');
    expect(context.identity).toEqual({
      cognitoIdentityId: 'id-1',
      cognitoIdentityPoolId: 'pool-1',
    });
    expect(context.clientContext?.custom).toEqual({ app: 'mobile' });
  });

  it('leaves identity and clientContext out by default', () => {
    const context = createMockContext();

    expect(context.identity).toBeUndefined();
    expect(context.clientContext).toBeUndefined();
  });

  it('provides the deprecated callbacks as harmless no-ops', () => {
    const context = createMockContext();

    expect(() => context.done()).not.toThrow();
    expect(() => context.fail('boom')).not.toThrow();
    expect(() => context.succeed('ok')).not.toThrow();
    expect(context.done()).toBeUndefined();
  });

  it('accepts spies for the deprecated callbacks', () => {
    const succeed = jest.fn();
    const context = createMockContext({ succeed });

    context.succeed('ok');

    expect(succeed).toHaveBeenCalledWith('ok');
  });

  it('returns a fresh object on every call', () => {
    const first = createMockContext();
    const second = createMockContext();

    first.functionName = 'mutated';

    expect(second.functionName).toBe(MOCK_FUNCTION_NAME);
    expect(first).not.toBe(second);
  });
});
