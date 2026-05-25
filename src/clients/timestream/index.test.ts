import { QueryCommand } from '@aws-sdk/client-timestream-query';
import { ListDatabasesCommand } from '@aws-sdk/client-timestream-write';
import { timestreamQueryClient, timestreamWriteClient } from './index';

describe('timestream clients', () => {
  it('should have execute methods', () => {
    expect(timestreamQueryClient).toHaveProperty('execute');
    expect(timestreamWriteClient).toHaveProperty('execute');
    expect(typeof timestreamQueryClient.execute).toBe('function');
    expect(typeof timestreamWriteClient.execute).toBe('function');
  });

  it('should execute QueryCommand without errors in structure', async () => {
    const command = new QueryCommand({ QueryString: 'SELECT 1' });

    await expect(timestreamQueryClient.execute(command, { retries: 0 })).rejects.toThrow();
  });

  it('should execute ListDatabasesCommand without errors in structure', async () => {
    const command = new ListDatabasesCommand({});

    await expect(timestreamWriteClient.execute(command, { retries: 0 })).rejects.toThrow();
  });

  it('should accept custom retry options', async () => {
    const command = new QueryCommand({ QueryString: 'SELECT 1' });

    await expect(
      timestreamQueryClient.execute(command, { retries: 0, minTimeout: 500, maxTimeout: 2000 })
    ).rejects.toThrow();
  });
});
