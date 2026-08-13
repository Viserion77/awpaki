/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  // No per-transformer options: `isolatedModules: true` in tsconfig.json satisfies what
  // ts-jest asks for under the hybrid Node16 module kind, so its TS151002 advisory is
  // resolved rather than silenced.
  // Source specifiers carry the `.js` extension NodeNext requires of an ESM build, but the
  // files on disk are `.ts` and ts-jest compiles them in place, so the extension has to be
  // stripped back off at resolution time.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    // Barrels only re-export; every re-exported function counts as an uncovered
    // function and drags the `functions` metric down without measuring anything.
    // Only the barrels are excluded here: `src/index.ts` (root) and the one-level
    // module barrels (`src/errors/index.ts`, `src/loggers/index.ts`, ...).
    // Deeper `index.ts` files are real implementations (`src/validators/isEmail/index.ts`,
    // `src/clients/s3/index.ts`, ...) and stay measured.
    '!src/index.ts',
    '!src/*/index.ts',
  ],
  coverageDirectory: 'coverage',
  // Ratchet, not aspiration: these sit just under the coverage the suite actually
  // achieves today (98.12 / 96.42 / 98.88 / 98.37 with the barrels excluded above),
  // so the gate fails on regression instead of on normal work. Raise them when the
  // real numbers rise; never lower them to make a red build green.
  coverageThreshold: {
    global: {
      statements: 95,
      branches: 93,
      functions: 95,
      lines: 95,
    },
  },
  verbose: true,
};
