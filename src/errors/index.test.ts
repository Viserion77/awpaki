import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import * as errors from './index.js';
import * as constants from '../constants/http-status.js';
import { HttpStatus } from './http/HttpStatus.js';

/**
 * Recursively lists every TypeScript file under a directory.
 *
 * @param dir - Absolute directory to walk
 * @returns Absolute paths of the `.ts` files found
 */
const listTsFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) return listTsFiles(fullPath);
    return fullPath.endsWith('.ts') ? [fullPath] : [];
  });

/** Reads a source file with block and line comments stripped. */
const readCode = (file: string): string =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const errorsFiles = listTsFiles(__dirname);

describe('errors barrel', () => {
  describe('public surface', () => {
    it('exports the error classes and factories', () => {
      const expected = [
        'HttpError',
        'BadRequest',
        'Unauthorized',
        'Forbidden',
        'NotFound',
        'Conflict',
        'PreconditionFailed',
        'UnprocessableEntity',
        'TooManyRequests',
        'InternalServerError',
        'NotImplemented',
        'BadGateway',
        'ServiceUnavailable',
        'HTTP_ERROR_MAP',
        'createHttpError',
      ];

      expected.forEach((name) => expect(errors).toHaveProperty(name));
    });

    it('exports every Lambda error handler', () => {
      const expected = [
        'handleApiGatewayError',
        'handleApiGatewayErrorV2',
        'handleGenericError',
        'handleSqsError',
        'handleSnsError',
        'handleEventBridgeError',
        'handleS3Error',
        'handleDynamoDBStreamError',
        'handleAppSyncError',
      ];

      expected.forEach((name) => expect(typeof (errors as any)[name]).toBe('function'));
    });
  });

  describe('deprecated HttpStatus re-export', () => {
    it('still exports the whole HttpStatus surface (removing it would be breaking)', () => {
      expect(errors.HttpStatus).toBeDefined();
      expect(errors.HttpErrorStatus).toBeDefined();
      expect(typeof errors.isValidHttpStatus).toBe('function');
      expect(typeof errors.isValidHttpErrorStatus).toBe('function');
      expect(typeof errors.getHttpStatusName).toBe('function');
    });

    it('resolves to the very same objects as awpaki/constants, preserving identity', () => {
      expect(errors.HttpStatus).toBe(constants.HttpStatus);
      expect(errors.HttpErrorStatus).toBe(constants.HttpErrorStatus);
      expect(errors.isValidHttpStatus).toBe(constants.isValidHttpStatus);
      expect(errors.isValidHttpErrorStatus).toBe(constants.isValidHttpErrorStatus);
      expect(errors.getHttpStatusName).toBe(constants.getHttpStatusName);
      expect(errors.HttpStatus).toBe(HttpStatus);
    });

    it('keeps working exactly like the preferred path', () => {
      expect(errors.HttpStatus.NOT_FOUND).toBe(404);
      expect(errors.isValidHttpStatus(404)).toBe(true);
      expect(errors.isValidHttpStatus(999)).toBe(false);
      expect(errors.getHttpStatusName(404)).toBe('NotFound');
    });

    it('is documented as deprecated in favour of awpaki/constants', () => {
      const source = readFileSync(join(__dirname, 'index.ts'), 'utf8');
      const docBlock = source.slice(0, source.indexOf('export {\n  HttpStatus'));

      expect(docBlock).toContain('@deprecated');
      expect(docBlock).toContain('awpaki/constants');
    });
  });

  describe('source guarantees for the whole errors tree', () => {
    it('finds the files it is supposed to scan', () => {
      expect(errorsFiles.length).toBeGreaterThan(0);
    });

    it.each(errorsFiles)('imports aws-lambda as type only in %s', (file) => {
      const statements = readCode(file).match(/import\s+(?:type\s+)?[^;]*?from\s+'aws-lambda'/g);

      (statements ?? []).forEach((statement) => expect(statement).toMatch(/^import\s+type\b/));
    });

    it.each(errorsFiles)('does not import any AWS SDK package in %s', (file) => {
      // Only src/clients/** may reach for the optional @aws-sdk peers
      expect(readCode(file)).not.toMatch(/(?:from\s+|require\()\s*['"]@aws-sdk\//);
    });
  });
});
