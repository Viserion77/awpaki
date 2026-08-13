import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import * as constants from './index.js';
import { defaultRetryOptions } from './default-retry-options.js';
import * as httpStatusSource from '../errors/http/HttpStatus.js';

describe('constants barrel', () => {
  it('exports the shared retry defaults', () => {
    expect(constants.defaultRetryOptions).toBe(defaultRetryOptions);
  });

  it('exports the HTTP status constants and guards', () => {
    expect(constants.HttpStatus).toBe(httpStatusSource.HttpStatus);
    expect(constants.HttpErrorStatus).toBe(httpStatusSource.HttpErrorStatus);
    expect(constants.isValidHttpStatus).toBe(httpStatusSource.isValidHttpStatus);
    expect(constants.isValidHttpErrorStatus).toBe(httpStatusSource.isValidHttpErrorStatus);
    expect(constants.getHttpStatusName).toBe(httpStatusSource.getHttpStatusName);
  });

  it('exposes exactly the expected public surface', () => {
    expect(Object.keys(constants).sort()).toEqual([
      'HttpErrorStatus',
      'HttpStatus',
      'defaultRetryOptions',
      'getHttpStatusName',
      'isValidHttpErrorStatus',
      'isValidHttpStatus',
    ]);
  });

  it('does not export AWS clients', () => {
    expect(Object.keys(constants)).not.toEqual(
      expect.arrayContaining(['dynamodbClient', 's3Client', 'sqsClient', 'snsClient'])
    );
  });

  it('does not depend on the optional @aws-sdk peer dependencies', () => {
    const files = readdirSync(__dirname)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
      .map((file) => join(__dirname, file));

    // The shared client types are consumed from here, so they must stay SDK-free too
    files.push(join(__dirname, '..', 'clients', 'index.types.ts'));

    const sources = files.map((file) => readFileSync(file, 'utf8'));
    const awsSdkModule = /(?:from\s+['"]|require\(\s*['"])@aws-sdk\//;

    expect(sources.length).toBeGreaterThan(0);
    sources.forEach((content) => {
      expect(content).not.toMatch(awsSdkModule);
    });
  });
});
