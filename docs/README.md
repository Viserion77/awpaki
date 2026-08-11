# awpaki documentation

This directory is the reference documentation for the library. The [root README](../README.md)
is the entry point — it explains what awpaki is and gets you to a first working handler; the
files here go deep on one subject each.

## How to navigate

| Read this                              | When you need to                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| [Getting started](getting-started.md)   | Install the package, understand the import model, write your first handler     |
| [Handlers](handlers.md)                 | Build a Lambda: the factories, and how to compose the pieces by hand           |
| [Validation](validation.md)             | Extract and validate input: schemas, decoders, validators, JSON body parsing   |
| [Errors](errors.md)                     | Throw and translate HTTP errors per trigger type                               |
| [Observability](observability.md)       | Log events, plug your own logger, cut CloudWatch cost with the log collector   |
| [AWS clients](aws-clients.md)           | Call AWS services with retry, invoke Lambdas, read cross-account credentials   |
| [Configuration](configuration.md)       | Know which environment variables the library reads, and what happens if unset  |
| [Utilities](utilities.md)               | Use the dependency-free object/string/date/bitmask helpers                     |
| [Testing](testing.md)                   | Build realistic API Gateway events and Lambda contexts in your own test suite  |
| [Architecture](architecture.md)         | Understand why the package is shaped the way it is, before changing it         |
| [Roadmap](roadmap.md)                   | See what is deliberately missing, what is planned, and what will never land    |

Contributors should also read [CONTRIBUTING.md](../CONTRIBUTING.md), which carries the working
rules (code style, type safety, tests, release process).

## The rule these documents follow

**Document why, never what.** The signature, the parameter list and the return type are already
in the code and in the `.d.ts` your editor reads — repeating them here only creates a second
copy that goes stale.

So a sentence like _"this Lambda has 200 MB of memory"_ does not belong in the documentation:
the value is in the template. What belongs is _"200 MB because the PDF renderer holds the whole
document in memory, and 128 MB started throwing OOM at ~40 pages"_. That is the part nobody can
recover from reading the code.

In practice, every page here answers:

- **Why does this exist** — which problem it removes, and what happens without it.
- **Why is it built this way** — the trade-off taken, and the alternative rejected.
- **What will surprise you** — the non-obvious behaviour, the gotcha, the sharp edge.

Reference material (tables of environment variables, status codes, decoder names) is kept, but
each one lives in exactly **one** file and is linked from everywhere else. If you find the same
explanation in two places, one of them is a bug.

The same rule applies to JSDoc in `src/`: the code comments explain the reasoning, and these
documents explain how the pieces fit together.
