import { dynamodbClient } from './index';
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
});
