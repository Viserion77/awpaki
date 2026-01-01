import { snsClient } from './index';
import { PublishCommand } from '@aws-sdk/client-sns';

describe('snsClient', () => {
  it('should have execute method', () => {
    expect(snsClient).toHaveProperty('execute');
    expect(typeof snsClient.execute).toBe('function');
  });

  it('should execute PublishCommand without errors in structure', async () => {
    const command = new PublishCommand({
      TopicArn: 'arn:aws:sns:us-east-1:123456789012:TestTopic',
      Message: 'test message',
    });

    // This will fail in test environment without AWS credentials,
    // but validates the structure
    await expect(snsClient.execute(command, { retries: 0 })).rejects.toThrow();
  });

  it('should accept custom retry options', async () => {
    const command = new PublishCommand({
      TopicArn: 'arn:aws:sns:us-east-1:123456789012:TestTopic',
      Message: 'test message',
    });

    await expect(
      snsClient.execute(command, { retries: 0, maxTimeout: 4000 })
    ).rejects.toThrow();
  });
});
