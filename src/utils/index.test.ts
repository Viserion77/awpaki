import * as utils from './index.js';

describe('utils barrel', () => {
  const expectedExports = [
    'cleanRecord',
    'compareJsonDiff',
    'mergeObjectChanges',
    'dynamicVariableSwitcher',
    'DEFAULT_VARIABLE_PATTERN',
    'kebabCaseToCamelCase',
    'capitalizeFirstLetter',
    'onlyDigits',
    'removeSpecialCharacters',
    'stringToArray',
    'formatDate',
    'changeDate',
    'getDiffDays',
    'hasFlag',
    'addFlags',
    'removeFlag',
    'encodeFlags',
    'decodeFlags',
    'MAX_FLAG_BIT',
    'uuidv7',
    'monotonicUuidv7',
  ];

  it.each(expectedExports)('should export %s', (name) => {
    expect(utils).toHaveProperty(name);
  });

  it('should export functions for every utility', () => {
    const values = ['DEFAULT_VARIABLE_PATTERN', 'MAX_FLAG_BIT'];

    for (const name of expectedExports.filter((exportName) => !values.includes(exportName))) {
      expect(typeof (utils as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('should not export anything unexpected', () => {
    expect(Object.keys(utils).sort()).toEqual([...expectedExports].sort());
  });

  it('should not export password encryption helpers', () => {
    // Deliberate exclusion: the implementation on offer used a fixed IV, and password
    // cryptography is not an AWS pattern. See docs/roadmap.md.
    expect(utils).not.toHaveProperty('encryptPassword');
    expect(utils).not.toHaveProperty('decryptPassword');
  });

  it('should keep the utilities usable straight from the barrel', () => {
    expect(utils.cleanRecord({ a: 1, b: undefined })).toEqual({ a: 1 });
    expect(utils.stringToArray('a, b')).toEqual(['a', 'b']);
    expect(utils.formatDate('2024-05-09T00:00:00Z')).toBe('2024-05-09');
    expect(utils.hasFlag(utils.encodeFlags([60]), 60)).toBe(true);
  });
});
