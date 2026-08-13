// `parseIntOrNaN` is intentionally absent: it is the internal coercion step shared by
// the numeric decoders and reports failure with `NaN` instead of throwing, so it does
// not follow the decoder contract this barrel publishes.
export {
  trimmedString,
  trimmedLowerString,
  alphanumericId,
  positiveInteger,
  limitedInteger,
  urlEncodedJson,
  jsonString,
  emailString,
  // Deprecated alias of `emailString`, kept so existing schemas keep working.
  validEmail,
  createEnum,
  stringArray,
  stringToBoolean,
  isoDateString,
  optionalTrimmedString,
  optionalInteger,
} from './decoders.js';

export { fromSanitizer } from './fromSanitizer/index.js';
export type { Sanitizer } from './fromSanitizer/index.js';
