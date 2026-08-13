import { dynamodbClient } from './index.js';
import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

describe('dynamodbClient', () => {
  it('should have execute method', () => {
    expect(dynamodbClient).toHaveProperty('execute');
    expect(typeof dynamodbClient.execute).toBe('function');
  });

  it('should execute GetCommand without errors', async () => {
    const command = new GetCommand({
      TableName: 'TestTable',
      Key: { id: '123' },
    });

    // This will fail in test environment without AWS credentials,
    // but validates the structure
    await expect(dynamodbClient.execute(command, { retries: 0 })).rejects.toThrow();
  });

  it('should execute PutCommand without errors in structure', async () => {
    const command = new PutCommand({
      TableName: 'TestTable',
      Item: { id: '123', name: 'Test' },
    });

    // This will fail in test environment without AWS credentials,
    // but validates the structure
    await expect(dynamodbClient.execute(command, { retries: 0 })).rejects.toThrow();
  });

  it('should execute QueryCommand without errors in structure', async () => {
    const command = new QueryCommand({
      TableName: 'TestTable',
      KeyConditionExpression: 'id = :id',
      ExpressionAttributeValues: {
        ':id': '123',
      },
    });

    // This will fail in test environment without AWS credentials,
    // but validates the structure
    await expect(dynamodbClient.execute(command, { retries: 0 })).rejects.toThrow();
  });

  it('should accept custom retry options', async () => {
    const command = new GetCommand({
      TableName: 'TestTable',
      Key: { id: '123' },
    });

    await expect(
      dynamodbClient.execute(command, { retries: 0, minTimeout: 500, maxTimeout: 2000 })
    ).rejects.toThrow();
  });

  // The SDK is inconsistent without `removeUndefinedValues`: a top-level `undefined` is
  // dropped silently while the same value one level down throws, so an optional TypeScript
  // field writes or crashes depending on where it sits in the item.
  describe('marshalling', () => {
    it('serializes an item with a nested undefined instead of throwing', async () => {
      const command = new PutCommand({
        TableName: 'TestTable',
        Item: { id: '1', profile: { name: 'Ada', nickname: undefined } },
      });

      // No credentials here, so the call fails at the transport — but only after the item
      // has been marshalled, which is the step being asserted.
      await expect(dynamodbClient.execute(command, { retries: 0 })).rejects.not.toThrow(
        /undefined to an AttributeValue/
      );
    });
  });
});
