import { GetRestApisCommand } from '@aws-sdk/client-api-gateway';
import { apiGatewayClient } from './index';

describe('apiGatewayClient', () => {
  it('should have execute method', () => {
    expect(apiGatewayClient).toHaveProperty('execute');
    expect(typeof apiGatewayClient.execute).toBe('function');
  });

  it('should execute GetRestApisCommand without errors in structure', async () => {
    const command = new GetRestApisCommand({});

    await expect(apiGatewayClient.execute(command, { retries: 0 })).rejects.toThrow();
  });

  it('should accept custom retry options', async () => {
    const command = new GetRestApisCommand({});

    await expect(
      apiGatewayClient.execute(command, { retries: 0, minTimeout: 500, maxTimeout: 2000 })
    ).rejects.toThrow();
  });
});
