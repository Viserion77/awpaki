import * as validators from './index.js';

const VALIDATOR_NAMES = [
  'isEmail',
  'isImage',
  'isObjEqual',
  'isValidSqlDatetime',
  'isValidName',
  'isValidFullName',
] as const;

describe('validators barrel', () => {
  it('exports every validator (the awpaki/validators subpath used to ship zero symbols)', () => {
    VALIDATOR_NAMES.forEach((name) => {
      expect(typeof validators[name]).toBe('function');
    });
    expect(validators.IMAGE_MIME_TYPES).toContain('image/png');
  });

  it('keeps every validator a total predicate that never throws', () => {
    const hostileValues: unknown[] = [
      undefined,
      null,
      0,
      NaN,
      '',
      '   ',
      true,
      [],
      {},
      Symbol('value'),
      () => undefined,
      new Date('invalid'),
      Object.create(null),
    ];

    VALIDATOR_NAMES.forEach((name) => {
      const validator = validators[name] as (value: unknown, other?: unknown) => unknown;
      hostileValues.forEach((value) => {
        expect(typeof validator(value, value)).toBe('boolean');
      });
    });
  });
});
