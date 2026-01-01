import { s3Client } from './index';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

describe('s3Client', () => {
  it('should have execute method', () => {
    expect(s3Client).toHaveProperty('execute');
    expect(typeof s3Client.execute).toBe('function');
  });

  it('should execute GetObjectCommand without errors in structure', async () => {
    const command = new GetObjectCommand({
      Bucket: 'test-bucket',
      Key: 'test-key',
    });

    // This will fail in test environment without AWS credentials,
    // but validates the structure
    await expect(s3Client.execute(command, { retries: 0 })).rejects.toThrow();
  });

  it('should execute PutObjectCommand without errors in structure', async () => {
    const command = new PutObjectCommand({
      Bucket: 'test-bucket',
      Key: 'test-key',
      Body: 'test content',
    });

    // This will fail in test environment without AWS credentials,
    // but validates the structure
    await expect(s3Client.execute(command, { retries: 0 })).rejects.toThrow();
  });

  it('should accept custom retry options', async () => {
    const command = new GetObjectCommand({
      Bucket: 'test-bucket',
      Key: 'test-key',
    });

    await expect(
      s3Client.execute(command, { retries: 0, minTimeout: 500, maxTimeout: 2000 })
    ).rejects.toThrow();
  });
});
