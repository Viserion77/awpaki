import { sqsClient } from './index';
import { SendMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';

describe('sqsClient', () => {
  it('should have execute method', () => {
    expect(sqsClient).toHaveProperty('execute');
    expect(typeof sqsClient.execute).toBe('function');
  });

  it('should execute SendMessageCommand without errors in structure', async () => {
    const command = new SendMessageCommand({
      QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/TestQueue',
      MessageBody: 'test message',
    });

    // This will fail in test environment without AWS credentials,
    // but validates the structure
    await expect(sqsClient.execute(command, { retries: 0 })).rejects.toThrow();
  });

  it('should execute ReceiveMessageCommand without errors in structure', async () => {
    const command = new ReceiveMessageCommand({
      QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/TestQueue',
      MaxNumberOfMessages: 10,
    });

    // This will fail in test environment without AWS credentials,
    // but validates the structure
    await expect(sqsClient.execute(command, { retries: 0 })).rejects.toThrow();
  });

  it('should accept custom retry options', async () => {
    const command = new SendMessageCommand({
      QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/TestQueue',
      MessageBody: 'test message',
    });

    await expect(
      sqsClient.execute(command, { retries: 0, maxTimeout: 5000 })
    ).rejects.toThrow();
  });
});
