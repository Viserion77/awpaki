# Roadmap and scope decisions

What is deliberately missing, what is planned, and what will never land. This file replaces the
ad-hoc audit documents that used to live in the repository root — the items they raised have
either shipped (see the [CHANGELOG](../CHANGELOG.md)) or are recorded below.

## Open items

Small, and none of them blocking. Each says why it has not happened yet.

### `transformers/` is an empty published subpath

`awpaki/transformers` resolves and exports nothing. It has been a placeholder since 1.0.0.
Removing it changes the `exports` map, which is breaking for anyone importing it (nobody
should be — it has never exported a symbol), so it waits for the next major.

If a real transformer shows up before then, the directory is already wired.

### Two file layouts coexist

New modules use **folder per unit** (`validators/isEmail/index.ts`); the oldest ones are still
grouped files (`decoders/decoders.ts`, `loggers/logLambdaEvent.ts`,
`errors/handlers/handleLambdaError.ts`, `parsers/parseJsonBody.ts`).

Converting them wholesale is a large diff that destroys `git blame` and changes no behaviour, so
they are converted when a file is rewritten for another reason. See
[architecture](architecture.md#file-layout).

### Deprecated symbols awaiting a major

| Symbol                                             | Replacement                | Removed in |
| -------------------------------------------------- | -------------------------- | ---------- |
| `validEmail`                                        | `emailString`              | next major |
| `HttpStatus` / `HttpErrorStatus` / their guards, exported from `awpaki/errors` and the root | the same names from `awpaki/constants` | next major |

Both keep working for the whole 1.x line. The status enums in particular are the most used
surface of the library after the error classes, and both paths resolve to the same object, so
identity comparisons keep working while code migrates.

### Version numbering

The releases after 1.5.0 added modules (`handlers`, `utils`, `validators`, `testing`,
`environment`, `constants`) rather than fixing bugs. Additive surface of that size is a **minor**
bump under semver; a patch number understates it for anyone reading the version to decide
whether to look at the changelog.

### Claims validated by reasoning, not by a live Lambda

Two behaviours were designed from AWS documentation and unit tests, and are worth confirming
against a real function before depending on them heavily:

- `console.*` producing a double JSON envelope under Advanced Logging Controls
  (`AWS_LAMBDA_LOG_FORMAT=JSON`) — the reason the logger writes to `stdout`.
- The pre-timeout flush firing in time on a genuine Lambda timeout, which depends on
  `getRemainingTimeInMillis()` accuracy near the deadline.

If the first one turns out not to hold, the `stdout` default is still correct (it is the channel
the platform reads in both modes); it simply stops being urgent.

## Deliberately out of scope

These were considered, and rejected. Recorded here so the discussion does not restart every six
months.

| Not shipping                             | Why                                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| Service-name unions, permission group registries, tenant catalogs | Product configuration, not a reusable pattern. The bitmask *engine* ships; the table of what each bit means does not. |
| Country-specific document, tax and phone validators | Jurisdiction-specific rules. If ever wanted, a separate package — not the core.        |
| A logging dependency (pino, Powertools, Winston) | All three are reasonable choices, so the library imposes none. It writes JSON to `stdout` and accepts any of them through `setLogger()`. |
| Password encryption / decryption         | Not an AWS pattern, and a "patterns kit" publishing a crypto primitive puts a seal of approval on however it was implemented. The particular implementation on offer used a fixed IV. |
| Integration-test harness (health checks for a local orchestrator, DB helpers, jest global setup files) | Harness for one product's test suite, not for consumers of a library. The event and context builders in [testing](testing.md) are the part that generalises. |
| Internal service wrappers (one function per named Lambda) | Zero value outside the codebase that owns those functions.                              |

## Candidates for the next major

Nothing here justifies a major on its own — the point of the list is to do them together, once,
with a migration note:

1. Remove the `awpaki/transformers` subpath (unless it gains content).
2. Remove `validEmail`.
3. Remove the `HttpStatus` re-export from `awpaki/errors` and from the package root.
4. Reconsider the `awpaki/clients` aggregate barrel. It works today (each client is a lazy
   getter, and a missing SDK produces an actionable error on first use), but the per-service
   subpath is strictly better and the aggregate exists only for convenience.

## Ideas, not commitments

- **More handler factories.** API Gateway REST (v1), S3 and EventBridge repeat a recognisable
  skeleton too. The v2/invoke/SQS three were built first because they cover the most traffic.
- **A `transformers/` with actual content**, if a recurring shape appears — response envelopes
  and pagination cursors are the plausible candidates.
