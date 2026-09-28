# Utilities

Pure helpers in `awpaki/utils`. No AWS SDK, no external dependency, no I/O — every one of them
takes values and returns values. They are here because each solves a problem that keeps
appearing in Lambda code, not because the package needed a `misc/` folder; see the scope rules
in [architecture](architecture.md#what-deliberately-stays-out).

## Objects

### `cleanRecord`

```typescript
cleanRecord({ name: 'sensor-1', description: undefined, group: null });
// → { name: 'sensor-1', group: null }
```

The pre-step of every `Record<string, string | undefined>` that goes to an AWS SDK command.
DynamoDB `ExpressionAttributeValues`, S3 `Metadata` and SQS `MessageAttributes` either reject
keys holding `undefined` or persist them as literal absence — either way, the caller has to strip
them.

**`null` is preserved on purpose.** Only `undefined` means "absent"; `null` is a value the caller
chose deliberately. The operation is shallow, and the return type drops `undefined` from each
value type, so TypeScript sees the result as cleaned.

### `compareJsonDiff`

```typescript
compareJsonDiff(previous, next);
// → { diff: <added or changed, nested>, removed: <keys gone, nested> }
```

For audit trails and change events: rather than storing both full documents, store what
actually changed. The result keeps the original nesting, so it reads like the object it came
from.

### `mergeObjectChanges`

```typescript
mergeObjectChanges(stored, patch);
mergeObjectChanges(stored, patch, { useOldKeysIfNotPresentInNew: false, addNewKeys: false });
```

A recursive merge with an explicit policy, which is what makes it usable for `PATCH` semantics:
`useOldKeysIfNotPresentInNew` decides whether omitted keys survive, `addNewKeys` decides whether
unknown keys are accepted. Both default to `true` and apply at every nesting level.

Two deliberate behaviours:

- **`undefined` in the patch means "not provided", never "erase this key".** A serialized JSON
  body cannot distinguish the two, so treating it as an erase would delete fields the client
  never mentioned.
- **Arrays replace, they do not concatenate.** Merging `[1,2]` into `[3]` to get `[3,1,2]` is
  almost never what a caller updating a list wants.

Neither input is mutated.

## Strings

| Function                          | Example                                             |
| --------------------------------- | --------------------------------------------------- |
| `kebabCaseToCamelCase(value)`     | `'user-id'` → `'userId'`                            |
| `capitalizeFirstLetter(value)`    | `'ana'` → `'Ana'`                                   |
| `onlyDigits(value)`               | `'(11) 98765-4321'` → `'11987654321'`               |
| `removeSpecialCharacters(value)`  | strips punctuation and symbols                      |
| `stringToArray(value, separator?)`| `'a, b , c'` → `['a', 'b', 'c']`                    |

`stringToArray` is the one with real behaviour behind it: it trims every part and drops empty
ones, and returns `[]` for `null`, `undefined` or a blank string. That is aimed squarely at
comma-separated environment variables and query strings (`ALLOWED_ORIGINS`, `?ids=1,2,3`), where
a trailing separator or a stray space is the norm and `''.split(',')` returning `['']` is a bug
waiting in a `for` loop. The result is always safe to iterate.

## Dates

No `moment`, no `date-fns`, no `dayjs` — three functions covering what Lambda code actually
needs, at zero bundle cost.

```typescript
formatDate('2024-05-09T13:07:04.090Z');                        // '2024-05-09'
formatDate('2024-05-09T13:07:04.090Z', 'DD/MM/YYYY HH:mm:ss'); // '09/05/2024 13:07:04'

changeDate('2024-05-09', { days: 7, months: -1 });             // a new Date
getDiffDays('2024-05-01', '2024-05-09');                       // 8
```

Tokens: `YYYY`, `MM`, `DD`, `HH`, `mm`, `ss`, `SSS`.

**Everything is UTC by default**, and that is the important part. Lambda runs with `TZ=UTC`,
DynamoDB/S3/CloudWatch timestamps are UTC, and a formatter that reads the machine's time zone
produces tests that pass on your laptop and fail in CI at the wrong hour of the day. Pass
`{ utc: false }` to `formatDate` when the local calendar genuinely is what matters.

Inputs accept a `Date`, an epoch in milliseconds, or a parseable string (ISO 8601 is the safe
choice). An unparseable value throws a `TypeError` — a programmer error, not a client error.
`changeDate` never mutates the date it receives.

## Template interpolation

```typescript
dynamicVariableSwitcher('Hello {{NAME}}, order {{ORDER_ID}} is ready.', {
  NAME: 'Ana',
  ORDER_ID: 42,
});
// → 'Hello Ana, order 42 is ready.'
```

For templates that live in configuration rather than in code — SES email bodies, SNS/IoT
payloads, Step Functions inputs — where the text comes from DynamoDB, S3 or an environment
variable and only the values are known at runtime.

The behaviours that matter:

- **A missing variable leaves the placeholder untouched.** Rendering `undefined` into an email
  body is worse than shipping `{{CITY}}`, which is obvious in a test, in a log and in review.
- **`null` renders as an empty string** — an explicit "there is no value here".
- **Only own enumerable keys are read**, so `{{constructor}}` and `{{__proto__}}` cannot pull
  anything off the prototype chain.
- The pattern is replaceable (`/\$\{(\w+)\}/g` for `${VAR}` syntax); a pattern without the `g`
  flag is upgraded to a global copy so all occurrences are still replaced.

## Permission bitmasks

A bitmask packs an unbounded set of boolean permissions into one scalar: flag `n` is bit `n`.
Checking becomes one AND, granting one OR, and an authorizer can carry the whole permission set
in a JWT claim or a single DynamoDB attribute instead of a list that grows forever.

```typescript
import { encodeFlags, decodeFlags, hasFlag, addFlags, removeFlag } from 'awpaki/utils';

const mask = encodeFlags([0, 3, 64]); // '18446744073709551625' — a decimal string
hasFlag(mask, 64);                    // true
addFlags(mask, [7, 8]);
removeFlag(mask, 3);
decodeFlags(mask);                    // [0, 3, 64]
```

Two implementation choices you need to know about, because they show at the API border:

**`bigint` internally.** JavaScript's bitwise operators coerce to **32-bit signed integers**, so
the naive version wraps silently at the 32nd flag — `1 << 32` is `1`, meaning flag 32 collides
with flag 0. Using `2 ** n` with `number` only moves the wall to bit 53, where rounding starts;
a rounded permission mask grants or revokes access at random. `bigint` has neither limit.

**A decimal string at the borders.** `bigint` must not leak out: `JSON.stringify({ mask: 1n })`
throws, and most DB drivers, the AWS SDK marshaller and every browser-side `JSON.parse` do not
know the type. So a mask crosses the API/database border as a decimal string
(`'1152921504606846976'`) — exact at any size, comparable as an opaque token, accepted
everywhere. Every function accepts a string (or a `bigint`) and every function that produces a
mask returns a string.

`number` is **rejected at runtime**, deliberately: accepting it would reintroduce the precision
loss the module exists to avoid. `MAX_FLAG_BIT` (1023) caps the bit position so a bogus
`hasFlag(mask, 1e9)` fails fast instead of building a billion-bit mask.

There is no registry of groups here. Which bit means "can publish" is product configuration, not a
reusable pattern — declare that mapping in your application and pass bit positions in.
