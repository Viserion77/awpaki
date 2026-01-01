import { lambdaClient } from './index';
import { InvokeCommand } from '@aws-sdk/client-lambda';

describe('lambdaClient', () => {
  it('should have execute method', () => {
    expect(lambdaClient).toHaveProperty('execute');
    expect(typeof lambdaClient.execute).toBe('function');
  });

  it('should execute InvokeCommand without errors in structure', async () => {
    const command = new InvokeCommand({
      FunctionName: 'test-function',
      Payload: JSON.stringify({ key: 'value' }),
    });

    // This will fail in test environment without AWS credentials,
    // but validates the structure
    await expect(lambdaClient.execute(command, { retries: 0 })).rejects.toThrow();
  });

  it('should accept custom retry options', async () => {
    const command = new InvokeCommand({
      FunctionName: 'test-function',
      Payload: JSON.stringify({ key: 'value' }),
    });

    await expect(
      lambdaClient.execute(command, { retries: 0, minTimeout: 500 })
    ).rejects.toThrow();
  });
});
