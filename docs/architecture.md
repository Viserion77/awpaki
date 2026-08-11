# Architecture

Why the package is shaped the way it is. Read this before adding a module, moving a symbol or
changing an export — most of the structure here is the answer to a defect that shipped once.

## The layers

awpaki is a thin framework, not a wrapper around the AWS SDK. Three layers, from the bottom up:

1. **Primitives** — `parsers`, `decoders`, `validators`, `errors`, `constants`, `utils`,
   `environment`. Pure functions and classes, no AWS SDK, no I/O.
2. **AWS-aware helpers** — `extractors`, `loggers`, `clients`. They know what a Lambda event
   looks like and what CloudWatch expects, but each one is usable on its own.
3. **Handler factories** — `handlers`. They compose the two layers below into the skeleton
   every Lambda repeats, so a route becomes a schema plus a business function.

Each layer only depends downwards. `handlers` importing `clients` would drag optional AWS peer
dependencies into every consumer of the package root, so it does not happen.

## The responsibility axis

Every module has one job, and the job determines the contract. This is the rule that prevents
the package from collapsing into a `misc/` folder:

| Category       | Contract                                                  | Throws?              |
| -------------- | --------------------------------------------------------- | -------------------- |
| `decoders/`    | `unknown → T`, coerce and normalize                        | **Yes** — on invalid |
| `validators/`  | `unknown → boolean`, inspect only                          | **Never**            |
| `utils/`       | pure value → value, no AWS knowledge                       | Only on programmer error (`TypeError`) |
| `extractors/`  | pull a value out of a structure (event, MIME type)         | Yes — as `HttpError` |
| `parsers/`     | text → structured data                                     | Yes — as `HttpError` |
| `constants/`   | values, enums and their guards                             | No                   |
| `environment/` | read `process.env`, resolve precedence                     | No                   |
| `loggers/`     | emit a record, never alter control flow                    | Never                |
| `clients/`     | talk to AWS with retry                                     | Yes — SDK errors     |
| `handlers/`    | compose all of the above into a handler                    | No — it catches      |
| `testing/`     | build fixtures for a consumer's test suite                 | Only on bad input    |

The split matters at the call site: `isEmail(value)` in an `if`, `emailString(value)` as a
schema decoder. Mixing them produces validators that throw inside a boolean expression, which
is the bug this table exists to prevent.

## Packaging model

### The root barrel is utility-only

`import { BadRequest } from 'awpaki'` must not load a single `@aws-sdk/*` package. In 1.4.1 it
did: the root re-exported `./clients`, every client module instantiated its SDK client at
import time, and the "optional" peer dependencies became mandatory — a project using only
`parseJsonBody` had to install DynamoDB, S3, SQS, SNS and Lambda to boot.

So `src/index.ts` re-exports everything **except** `clients`, and AWS clients are reachable only
through their subpaths. This is enforced by a regression test, not by discipline.

`testing/` is also excluded from the root on purpose: it is scaffolding for a consumer's test
suite, and the root barrel is what production code imports.

### Subpaths are the public API surface

`package.json` declares `exports` (what Node resolves) **and** `typesVersions` (what TypeScript
resolves under `moduleResolution: node`/`node10`). Both are needed: with only `exports`,
consumers on the older resolution mode get working imports with no types.

Import the narrowest subpath you can — `awpaki/clients/s3` resolves exactly one AWS SDK package.

### The `awpaki/clients` aggregate barrel is lazy

The aggregate barrel exists for convenience, but a plain `export … from './s3/index'` would make
it require all thirteen SDKs, reproducing the 1.4.1 defect one level down. Each name is
therefore installed as a getter that `require`s its module on first access.

Two details in `src/clients/index.ts` are load-bearing and easy to break:

- The `exports.<name> = undefined` assignments before the getters. Node's CommonJS→ESM interop
  discovers named exports by **parsing** the emitted file, and only recognises that form.
  Removing them breaks `import { s3Client } from 'awpaki/clients'` in native ESM.
- A getter must never throw. The same interop reads every export while evaluating the module
  and swallows the error, turning the binding into `undefined` and surfacing the missing peer
  much later as `Cannot read properties of undefined`. So a failed `require` returns a proxy
  that throws an actionable message on first *use* instead.

### `@types/aws-lambda` is a real dependency

Three published `.d.ts` files reference types from `aws-lambda`. Shipping those types as a
`devDependency` left consumers with `TS2307` errors — or, with `skipLibCheck: true` (the common
case), silently degraded every parameter to `any`. It is a types-only package with no runtime,
so it belongs in `dependencies`.

The npm package literally named `aws-lambda` is an unrelated CLI tool; it is not a peer
dependency of this library, and never should be.

## File layout

```
src/
├── index.ts                # Root barrel: everything except clients and testing
├── handlers/               # Handler factories (the framework layer)
├── extractors/             # extractEventParams, getExtensionFromMimeType
├── parsers/                # parseJsonBody
├── decoders/               # Coercing decoders (throw on invalid)
├── validators/             # Pure predicates (never throw)
├── errors/                 # HttpError hierarchy + per-trigger error handlers
├── constants/              # HttpStatus, HttpErrorStatus, defaultRetryOptions
├── loggers/                # Entry loggers, pluggable logger, runtime log collector
├── environment/            # resolveRegion, resolveEndpoint, resolveStage
├── utils/                  # Objects, strings, dates, bitmask, template interpolation
├── testing/                # Mock event and context builders
├── transformers/           # Empty — see the roadmap
└── clients/                # One folder per AWS service + lazy aggregate barrel
```

Two conventions coexist, deliberately:

- **Folder per unit** (`validators/isEmail/index.ts`, `clients/s3/index.ts`) — the target
  convention, used by all new code.
- **Grouped file** (`decoders/decoders.ts`, `loggers/logLambdaEvent.ts`) — the original layout,
  still in place for the oldest modules.

Migrating the old files wholesale would produce an enormous diff, destroy `git blame` and change
no behaviour. They are converted when a file is rewritten for another reason. See the
[roadmap](roadmap.md).

Tests live next to the code they cover (`index.test.ts` beside `index.ts`), so a module is never
moved without its tests.

## What deliberately stays out

The library is called *AWS Patterns Kit*, and the name is the scope test. Rejected, with the
reason:

- **Domain and product code** — service-name unions, permission group catalogs, tenant
  registries. The bitmask *engine* is a reusable pattern; the table of what each bit means is
  not (`src/utils/permissionsBitmask.ts` documents this split).
- **Country-specific rules** — document/phone validators and formatters for a single
  jurisdiction. If they are ever wanted, they are a separate package.
- **A logging dependency** — pino, Powertools and Winston are all plausible choices, so the
  library imposes none. It writes JSON to `stdout` by default and accepts any of them through
  `setLogger()`. See [observability](observability.md).
- **Password cryptography** — not an AWS pattern, and a "patterns kit" publishing a crypto
  primitive puts a seal of approval on however it was implemented.

See the [roadmap](roadmap.md) for the full list and the current open items.
