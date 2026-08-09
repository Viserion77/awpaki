export { cleanRecord, compareJsonDiff, mergeObjectChanges } from './objects';
export type { CleanedRecord, JsonDiffResult, MergeObjectChangesPolicy } from './objects';

export { dynamicVariableSwitcher, DEFAULT_VARIABLE_PATTERN } from './dynamicVariableSwitcher';
export type { DynamicVariableValue, DynamicVariables } from './dynamicVariableSwitcher';

export {
  kebabCaseToCamelCase,
  capitalizeFirstLetter,
  onlyDigits,
  removeSpecialCharacters,
  stringToArray,
} from './strings';

export { formatDate, changeDate, getDiffDays } from './dates';
export type { DateInput, DateChanges, FormatDateOptions } from './dates';

export {
  hasFlag,
  addFlags,
  removeFlag,
  encodeFlags,
  decodeFlags,
  MAX_FLAG_BIT,
} from './permissionsBitmask';
export type { BitmaskInput } from './permissionsBitmask';
