# Validation

Turning an untrusted Lambda event into typed, validated parameters. Four pieces, each with a
different job:

| Piece                | Contract                        | On invalid input                      |
| -------------------- | ------------------------------- | ------------------------------------- |
| `parseJsonBody`      | JSON text → object              | throws `BadRequest`                   |
| `extractEventParams` | event + schema → typed params   | throws an `HttpError` with all errors |
| decoders             | `unknown` → `T`, normalizing    | **throw** — that is the contract      |
| validators           | `unknown` → `boolean`           | **never throw** — they return `false` |

The split between decoders and validators is the one to internalise: a decoder is used *as* a
schema field (`decoder: emailString`), a validator is used *in* an `if` (`if (isEmail(x))`).
Mixing them produces predicates that throw inside a boolean expression.

## `extractEventParams`

One call replaces the pile of `if (!event.pathParameters?.id) return { statusCode: 400 }` that
otherwise opens every handler — and, more importantly, it reports **every** problem at once
instead of making the caller fix one field per round trip.

```typescript
import { extractEventParams, ParameterType, HttpErrorStatus, UnprocessableEntity } from 'awpaki';

try {
  const params = extractEventParams<{ id: string; email: string; age: number }>(
    {
      pathParameters: {
        id: {
          label: 'User ID',
          required: true,
          expectedType: ParameterType.STRING,
          statusCodeError: HttpErrorStatus.NOT_FOUND,
        },
      },
      headers: {
        authorization: {
          label: 'Authorization',
          required: true,
          caseInsensitive: true,
          statusCodeError: HttpErrorStatus.UNAUTHORIZED,
        },
      },
      body: {
        email: { label: 'Email', required: true, expectedType: ParameterType.STRING },
        age: { label: 'Age', expectedType: ParameterType.NUMBER, default: 18 },
      },
    },
    event
  );
} catch (error) {
  if (error instanceof UnprocessableEntity) {
    console.log(error.errors);
    // { 'body.email': 'Email is required', 'body.age': 'Age must be of type number' }
  }
}
```

### Schema fields

Every leaf of the schema is a `ParameterConfig`:

| Field              | Why you would set it                                                       |
| ------------------ | -------------------------------------------------------------------------- |
| `label`            | The human name used in every generated message — the only required field    |
| `required`         | Missing value becomes an error instead of being skipped                     |
| `expectedType`     | Type check before your code runs, using `ParameterType`                     |
| `default`          | Value used when the parameter is absent (implies not required)              |
| `statusCodeError`  | Status for *this* field — a missing path param is a 404, a missing token 401 |
| `notFoundError`    | Replaces the default "X is required" message                                |
| `wrongTypeMessage` | Replaces the default type/decoder failure message                           |
| `caseInsensitive`  | Matches the key regardless of casing — headers, essentially                 |
| `decoder`          | Coerce and normalize the value (see [decoders](#decoders))                  |

Anything that is not a `ParameterConfig` is treated as a nested branch, so schemas mirror the
event: `pathParameters`, `queryStringParameters`, `headers`, `body` (JSON-parsed automatically),
and any custom path — `identity.claims.email` for AppSync, `body.order.items` for a nested
payload.

### Two behaviours worth knowing

**Results are keyed by the leaf name, not the path.** A schema of
`{ body: { email }, headers: { authorization } }` yields `{ email, authorization }` — flat. Two
leaves with the same name in different branches therefore collide, and the last one wins. Errors
*are* keyed by the full path (`body.email`), which is what makes the error map readable.

**Status code selection when several fields fail.** A single failure uses that field's
`statusCodeError`. Multiple failures use the **highest** status code among them, so a request
missing both a token (401) and a body field (422) answers 422 with every error listed — the
caller sees the whole picture in one response.

### `ParameterType`

```typescript
enum ParameterType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  OBJECT = 'object', // plain object only
  ARRAY = 'array',   // array only
}
```

`OBJECT` and `ARRAY` are mutually exclusive, which needs saying because a naive implementation
gets it wrong: `typeof [] === 'object'`, so a field declared `OBJECT` used to accept `[1,2,3]`
and hand the array to business logic expecting a record. Both are now checked explicitly.

Use the enum rather than the string literal — `expectedType: 'strng'` is a silent typo that
disables the check, `ParameterType.STRNG` does not compile.

## `parseJsonBody`

`JSON.parse(event.body)` fails in three different ways (`null` body, empty string, malformed
JSON) and all three surface as a 500 unless you handle them. This does it once, with a typed
error:

```typescript
import { parseJsonBody } from 'awpaki';

const user = parseJsonBody<User>(event.body);
// throws BadRequest when the body is missing, empty or not valid JSON

const filters = parseJsonBody<Filters>(event.body, { defaultValue: {} });
// `defaultValue` is what makes the body optional — no default means required
```

`extractEventParams` calls it for you when the schema has a `body` branch, so parse manually only
when you are not using a schema.

## Decoders

A decoder runs **after** the type check and turns a valid-looking value into the value your code
actually wants — trimmed, lowercased, coerced, bounded. It signals rejection by throwing, and
`extractEventParams` converts that throw into a field error alongside all the others.

```typescript
import { extractEventParams, ParameterType, emailString, trimmedString, createEnum } from 'awpaki';

const params = extractEventParams(
  {
    body: {
      email: {
        label: 'Email',
        required: true,
        expectedType: ParameterType.STRING,
        decoder: emailString, // validates the format, returns it lowercased
      },
      name: { label: 'Name', required: true, decoder: trimmedString },
      status: { label: 'Status', required: true, decoder: createEnum(['active', 'inactive']) },
    },
  },
  event
);
```

### Available decoders

**Strings**

| Decoder                            | Behaviour                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `trimmedString`                    | Trims; throws when the result is empty                                        |
| `trimmedLowerString`               | Trims and lowercases; throws when empty                                       |
| `alphanumericId`                   | Letters, digits, `-` and `_` only; returns it lowercased                      |
| `emailString`                      | Validates via `isEmail`, returns it lowercased                                |
| `optionalTrimmedString(fallback?)` | Trims a string; anything else returns the fallback (default `''`) — never throws |

**Numbers**

| Decoder                       | Behaviour                                                                 |
| ----------------------------- | -------------------------------------------------------------------------- |
| `positiveInteger`             | Coerces to a number, requires `> 0`                                        |
| `limitedInteger(min?, max?)`  | Coerces and bounds it (defaults `1`–`1000`)                                |
| `optionalInteger(fallback?)`  | Coerces; unparseable **and falsy** values return the fallback (default `0`) |

Coercion is shared: strings go through `parseInt(value, 10)` — so `'12px'` becomes `12` — and
non-numeric types yield a failure. `optionalInteger` returns the fallback for `0` and `''` too,
because it short-circuits on falsy input before coercing; that differs from the two above and is
usually what you want for a page number.

**Structured**

| Decoder                  | Behaviour                                                              |
| ------------------------ | ---------------------------------------------------------------------- |
| `jsonString`             | `JSON.parse` of a string; non-strings and empty values return `null`   |
| `urlEncodedJson`         | `decodeURIComponent` then `JSON.parse` — for JSON smuggled in a query string |
| `stringArray`            | Keeps only non-empty strings; a non-array returns `[]` — never throws  |
| `createEnum(values)`     | Case-insensitive membership, returns the lowercased value              |
| `stringToBoolean`        | `true/1/yes/on` → `true`, `false/0/no/off` → `false`, anything else throws |
| `isoDateString`          | Parses a date and returns the normalized ISO string                    |

Query strings and headers only ever carry text, which is why `stringToBoolean` and the numeric
decoders exist: `?active=false` is the string `'false'`, and `Boolean('false')` is `true`.

`validEmail` is a deprecated alias of `emailString`, kept so existing schemas keep working.
Prefer `emailString`.

> **Behaviour change worth checking on upgrade:** `emailString` delegates to the `isEmail`
> validator instead of the old `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Addresses that used to pass and
> now fail: single-character or numeric TLDs (`a@b.c`, `user@example.c0m`), labels starting or
> ending with `-`, consecutive dots, local parts over 64 chars, addresses over 254. Newly
> accepted: quoted local parts (`"john doe"@example.com`) and address literals
> (`user@[192.168.0.1]`).

### Writing your own

Any `(value: unknown) => T` that throws on invalid input works:

```typescript
const sku = {
  label: 'SKU',
  required: true,
  decoder: (value: unknown) => {
    if (typeof value !== 'string' || !/^[A-Z]{3}-\d{4}$/.test(value)) {
      throw new Error('SKU must look like ABC-1234');
    }
    return value;
  },
};
```

The message you throw is not what the caller sees — `extractEventParams` reports
`wrongTypeMessage` if you set one, or `"<label> has invalid format"`. Keep the thrown message
for the logs.

## Validators

Pure predicates. They never throw and never transform, so they compose in conditions, filters
and assertions:

| Validator            | Returns true when                                                            |
| -------------------- | ----------------------------------------------------------------------------- |
| `isEmail`            | The value is a well-formed address (RFC-ish: quoted local parts, IP literals, label and length limits) |
| `isImage`            | The value is a known image MIME type — an allow list, not a `startsWith('image/')` guess |
| `isObjEqual`         | Two values are deeply equal (handles `Date`, `Map`, `Set`, cycles, prototypes) |
| `isValidSqlDatetime` | The value is `'YYYY-MM-DD HH:MM:SS'` *and* denotes a real calendar date        |
| `isValidName`        | The value is one name word — letters of any alphabet, accents, `'` and `-`     |
| `isValidFullName`    | At least two such words                                                       |

Two of these are stricter than they look on purpose. `isValidSqlDatetime` rejects `2023-02-30`,
because a regex that only checks the shape lets an impossible date reach the database. `isImage`
uses an allow list including the legacy aliases browsers still send (`image/jpg`,
`image/x-png`), because `startsWith('image/')` accepts `image/svg+xml` — an executable document
in most contexts.

`isObjEqual` is worth knowing about before reaching for a dependency: it compares own enumerable
keys (strings and symbols), walks `Map`/`Set` in insertion order, treats `NaN` as equal to
itself, distinguishes prototypes, and terminates on cyclic structures.

## MIME types

`getExtensionFromMimeType` sits in `extractors/` — it pulls a value out of a structure, the
structure being a lookup table:

```typescript
import { getExtensionFromMimeType } from 'awpaki/extractors';

getExtensionFromMimeType('image/jpeg');                  // 'jpg'
getExtensionFromMimeType('application/pdf; charset=x');  // 'pdf' — parameters are stripped
getExtensionFromMimeType('application/x-unknown');       // undefined
```

The input is normalized (lowercased, parameters after `;` dropped) so a raw `Content-Type`
header can be passed straight in. `MIME_TYPE_TO_EXTENSION` is exported for the reverse direction
and `FILE_EXTENSIONS` gives the extension names as an enum.
