import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { secretsManagerClient } from './index';

describe('secretsManagerClient', () => {
  it('should have execute method', () => {
    expect(secretsManagerClient).toHaveProperty('execute');
    expect(typeof secretsManagerClient.execute).toBe('function');
  });

  it('should execute GetSecretValueCommand without errors in structure', async () => {
    const command = new GetSecretValueCommand({ SecretId: 'test-secret' });

    await expect(secretsManagerClient.execute(command, { retries: 0 })).rejects.toThrow();
  });

  it('should accept custom retry options', async () => {
    const command = new GetSecretValueCommand({ SecretId: 'test-secret' });

    await expect(
      secretsManagerClient.execute(command, { retries: 0, minTimeout: 500, maxTimeout: 2000 })
    ).rejects.toThrow();
  });
});
