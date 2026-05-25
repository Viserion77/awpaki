import { ListThingsCommand } from '@aws-sdk/client-iot';
import { iotClient } from './index';

describe('iotClient', () => {
  it('should have execute method', () => {
    expect(iotClient).toHaveProperty('execute');
    expect(typeof iotClient.execute).toBe('function');
  });

  it('should execute ListThingsCommand without errors in structure', async () => {
    const command = new ListThingsCommand({});

    await expect(iotClient.execute(command, { retries: 0 })).rejects.toThrow();
  });

  it('should accept custom retry options', async () => {
    const command = new ListThingsCommand({});

    await expect(
      iotClient.execute(command, { retries: 0, minTimeout: 500, maxTimeout: 2000 })
    ).rejects.toThrow();
  });
});
