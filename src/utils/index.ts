export { cleanRecord, compareJsonDiff, mergeObjectChanges } from './objects.js';
export type { CleanedRecord, JsonDiffResult, MergeObjectChangesPolicy } from './objects.js';

export { dynamicVariableSwitcher, DEFAULT_VARIABLE_PATTERN } from './dynamicVariableSwitcher.js';
export type { DynamicVariableValue, DynamicVariables } from './dynamicVariableSwitcher.js';

export {
  kebabCaseToCamelCase,
  capitalizeFirstLetter,
  onlyDigits,
  removeSpecialCharacters,
  stringToArray,
} from './strings.js';

export { formatDate, changeDate, getDiffDays } from './dates.js';
export type { DateInput, DateChanges, FormatDateOptions } from './dates.js';

export {
  hasFlag,
  addFlags,
  removeFlag,
  encodeFlags,
  decodeFlags,
  MAX_FLAG_BIT,
} from './permissionsBitmask.js';
export type { BitmaskInput } from './permissionsBitmask.js';

// Sortable identifiers (RFC 9562 §5.7). The one deliberately impure module of this category:
// it reads the clock and a CSPRNG, which is the point.
export { uuidv7, monotonicUuidv7 } from './uuidv7/index.js';
