import * as decoders from './index.js';
import { emailString, validEmail } from './index.js';

describe('decoders barrel', () => {
  it('exports every public decoder', () => {
    expect(Object.keys(decoders).sort()).toEqual(
      [
        'alphanumericId',
        'createEnum',
        'emailString',
        'fromSanitizer',
        'isoDateString',
        'jsonString',
        'limitedInteger',
        'optionalInteger',
        'optionalTrimmedString',
        'positiveInteger',
        'stringArray',
        'stringToBoolean',
        'trimmedLowerString',
        'trimmedString',
        'urlEncodedJson',
        'validEmail',
      ].sort()
    );
  });

  it('keeps parseIntOrNaN internal', () => {
    expect(decoders).not.toHaveProperty('parseIntOrNaN');
  });

  it('keeps validEmail working as an alias of emailString', () => {
    expect(validEmail('USER@EXAMPLE.COM')).toBe(emailString('USER@EXAMPLE.COM'));
    expect(() => validEmail('a@b.c')).toThrow('Email must have a valid format');
  });
});
