# Repository instructions

This file is intentionally short. The working rules live in one place, and this points to it —
duplicating them here would create a second copy that drifts.

**Before writing code in this repository, read:**

1. [CONTRIBUTING.md](../CONTRIBUTING.md) — module boundaries, code style, type-safety rules,
   documentation rules, tests, releases.
2. [docs/architecture.md](../docs/architecture.md) — why the package is shaped this way: the
   layers, the responsibility axis that decides where code goes, and the packaging constraints
   (the root barrel must never load an AWS SDK; the lazy clients barrel has load-bearing
   details).
3. [docs/roadmap.md](../docs/roadmap.md) — what is deliberately out of scope, so proposals do not
   repeat rejected ones.

**The rules most often broken by generated code, in one line each:**

- Document **why**, never what. No comment or doc that restates a signature.
- Never create ad-hoc markdown in the repository root (`ANALYSIS.md`, `NOTES.md`, `RESUMO.md`).
  Documentation goes in the `docs/` file that owns the subject.
- Never reference a private or downstream repository. This is a public package.
- `function name() {}`, not `const name = () => {}` — anonymous frames make production stack
  traces useless.
- No `forEach`; use `for...of` or `map`/`filter`/`reduce`.
- No magic numbers or strings where an enum exists (`HttpStatus`, `HttpErrorStatus`,
  `ParameterType`).
- Tests beside the code, covering the failure path too.
- English everywhere — code, comments, docs, changelog.
