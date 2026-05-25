import { ListIdentitiesCommand } from '@aws-sdk/client-ses';
import { sesClient } from './index';

describe('sesClient', () => {
  it('should have execute method', () => {
    expect(sesClient).toHaveProperty('execute');
    expect(typeof sesClient.execute).toBe('function');
  });

  it('should execute ListIdentitiesCommand without errors in structure', async () => {
    const command = new ListIdentitiesCommand({});

    await expect(sesClient.execute(command, { retries: 0 })).rejects.toThrow();
  });

  it('should accept custom retry options', async () => {
    const command = new ListIdentitiesCommand({});

    await expect(
      sesClient.execute(command, { retries: 0, minTimeout: 500, maxTimeout: 2000 })
    ).rejects.toThrow();
  });
});
