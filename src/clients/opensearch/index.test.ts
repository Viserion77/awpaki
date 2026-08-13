import { ListDomainNamesCommand } from '@aws-sdk/client-opensearch';
import { openSearchClient } from './index.js';

describe('openSearchClient', () => {
  it('should have execute method', () => {
    expect(openSearchClient).toHaveProperty('execute');
    expect(typeof openSearchClient.execute).toBe('function');
  });

  it('should execute ListDomainNamesCommand without errors in structure', async () => {
    const command = new ListDomainNamesCommand({});

    await expect(openSearchClient.execute(command, { retries: 0 })).rejects.toThrow();
  });

  it('should accept custom retry options', async () => {
    const command = new ListDomainNamesCommand({});

    await expect(
      openSearchClient.execute(command, { retries: 0, minTimeout: 500, maxTimeout: 2000 })
    ).rejects.toThrow();
  });
});
