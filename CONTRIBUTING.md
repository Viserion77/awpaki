# Contributing to awpaki

Read [docs/architecture.md](docs/architecture.md) first — it explains why the package is shaped
the way it is, and most rules below follow from it.

## Setup

```bash
npm install
npm test            # 56 suites, 1140 tests
npm run test:watch
npm run build       # tsc -> dist/
npm run lint
npm run format
```

Before opening a pull request, run what CI runs:

```bash
npm run lint && npm run format:check && npm run test:coverage && npm run build
npm run test:package   # packs the real tarball and exercises it from a clean project
```

## Adding a feature

**1. Pick the category by contract, not by topic.** The
[responsibility axis](docs/architecture.md#the-responsibility-axis) decides where code goes: a
function that throws on invalid input is a decoder, one that returns a boolean is a validator,
one that reads `process.env` is in `environment/`. "It is about e-mail" is not a category.

**2. Create a folder per unit**, with the test beside it:

```
src/validators/isPhoneNumber/
  index.ts
  index.test.ts
```

**3. Export it from the category barrel**, and only from there. The root barrel picks up
categories, never individual files — and it must never re-export `clients` or `testing`.

**4. Cover both paths.** Success and failure, plus whatever edge case motivated the code. The
coverage gate (95/93/95/95) fails the build on regression; it is set just under what the suite
actually achieves, so normal work does not trip it. Never lower it to make a build green.

**5. Update the docs.** New public surface means a section in the matching file under
[docs/](docs/), and an entry in [CHANGELOG.md](CHANGELOG.md).

## Documentation rules

**Document why, never what.** The signature and the types are already in the code — repeating
them creates a second copy that goes stale. Write the reasoning that cannot be recovered from
reading the code.

> ❌ "This Lambda has 200 MB of memory."
> ✅ "200 MB because the PDF renderer holds the whole document in memory; 128 MB started throwing
> OOM at ~40 pages."

Concretely:

- **JSDoc on every exported symbol**, explaining the trade-off, the gotcha and the rejected
  alternative — not restating the parameter list. `@param`/`@returns`/`@throws` still get one
  line each, because editors show them.
- **One home per fact.** Environment variables live in
  [docs/configuration.md](docs/configuration.md), status codes in
  [docs/errors.md](docs/errors.md). Everything else links there. Duplicated explanations are
  bugs — one copy always rots.
- **No ad-hoc markdown in the repository root.** `ANALYSIS.md`, `NOTES.md`, `SUMMARY.md`,
  `IMPROVEMENTS.md` and friends go stale within a week and nobody deletes them. Findings belong
  in the pull request, decisions belong in [docs/roadmap.md](docs/roadmap.md), and reference
  material belongs in the `docs/` file that owns the subject.
- **No references to private or downstream repositories.** This is a public package: it must be
  readable by someone who has never seen the codebases that consume it. Attribution goes at the
  bottom of the [README](README.md), by company name.
- **English everywhere** — code, comments, docs, changelog.

## Code style

Enforced by ESLint and Prettier where possible, by review where not.

**Function declarations over arrow constants.**

```typescript
// ✅ appears as `parseJsonBody` in the stack trace
export function parseJsonBody<T>(body: string): T {}

// ❌ shows as <anonymous> — the production stack trace tells you nothing
export const parseJsonBody = <T>(body: string): T => {};
```

Arrow functions are fine as inline callbacks (`.map(x => x * 2)`) and for one-line internals.

**No `forEach`.** Use `for...of` when iterating for effect, `map`/`filter`/`reduce` when
producing a value. `forEach` cannot `break`, `continue` or `await` in the way you expect, and it
is the shape most often converted back during review.

**No magic numbers or strings** where an enum exists:

```typescript
// ❌
statusCodeError: 401;
expectedType: 'string';
throw new HttpError('Error', 404);

// ✅
statusCodeError: HttpErrorStatus.UNAUTHORIZED;
expectedType: ParameterType.STRING;
throw new NotFound('Error');
```

A typo in `'strng'` silently disables a type check; `ParameterType.STRNG` does not compile.

**Type safety:**

- Explicit parameter and return types on every exported function.
- No `any` unless it is genuinely unavoidable — and then a comment saying why. AWS SDK command
  types are the usual legitimate case.
- `interface` for object shapes that may be extended, `type` for unions and intersections,
  `enum` for closed sets.
- Type-only re-exports must be spelled `export type`. `isolatedModules` is on, because ts-jest,
  esbuild and swc all transpile file by file and cannot know a specifier is erasable.

**Keep functions pure and single-purpose.** The categories only stay meaningful if the functions
inside them do one thing.

## Tests

- Co-located, named `index.test.ts` (or `<file>.test.ts` for grouped modules).
- Assert behaviour, not implementation. A test that mirrors the code line by line fails on every
  refactor and catches nothing.
- The event and context builders in [docs/testing.md](docs/testing.md) are for consumers, and
  the internal suite uses them too — do not hand-roll fixtures.
- The library writes to `stdout`, not through `console`, so silence logs with `setLogger` and
  restore with `resetLogger` rather than spying on `console`.

## Releasing

1. Update `version` in `package.json` following semver. Additive surface is a **minor**, not a
   patch.
2. Add the matching section to [CHANGELOG.md](CHANGELOG.md).
3. Merge to `main`. CI runs lint, format check, coverage, build and the packaged-tarball smoke
   test.
4. Create a GitHub release with the tag (`v1.6.0`). The publish workflow builds, tests and pushes
   to npm.

Publishing requires the `NPM_TOKEN` secret in the repository settings. The workflow can also be
triggered manually from the Actions tab.

`package.json#files` ships `dist`, `README.md` and `LICENSE` only — the `docs/` tree stays in the
repository, which is why the README links to it with relative paths that npm rewrites to GitHub.
