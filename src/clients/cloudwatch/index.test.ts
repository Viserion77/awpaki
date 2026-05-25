import { ListMetricsCommand } from '@aws-sdk/client-cloudwatch';
import { cloudWatchClient } from './index';

describe('cloudWatchClient', () => {
  it('should have execute method', () => {
    expect(cloudWatchClient).toHaveProperty('execute');
    expect(typeof cloudWatchClient.execute).toBe('function');
  });

  it('should execute ListMetricsCommand without errors in structure', async () => {
    const command = new ListMetricsCommand({ Namespace: 'AWS/Lambda' });

    await expect(cloudWatchClient.execute(command, { retries: 0 })).rejects.toThrow();
  });

  it('should accept custom retry options', async () => {
    const command = new ListMetricsCommand({ Namespace: 'AWS/Lambda' });

    await expect(
      cloudWatchClient.execute(command, { retries: 0, minTimeout: 500, maxTimeout: 2000 })
    ).rejects.toThrow();
  });
});
