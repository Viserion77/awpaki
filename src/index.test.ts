import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as awpaki from './index.js';
import * as clients from './clients/index.js';

/**
 * Every non-test `.ts` file under `src/`, except `src/clients/**`: that directory is the
 * single place allowed to reach for the optional `@aws-sdk/*` peers, and it is
 * deliberately not re-exported from the package root.
 */
const collectSourceFiles = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) {
      if (entry === 'clients') continue;
      collectSourceFiles(full, acc);
      continue;
    }

    if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) acc.push(full);
  }

  return acc;
};

const sourceFiles = collectSourceFiles(__dirname).map((file) => relative(__dirname, file));

const readSource = (file: string): string => readFileSync(join(__dirname, file), 'utf8');

// Anchored at the start of a line (imports are top level and prettier keeps them at
// column 0) so prose mentioning the word "import" in a comment cannot be glued to a
// later `from 'aws-lambda'`; `[^;]*?` then keeps the match inside a single statement.
const AWS_LAMBDA_VALUE_IMPORT = /^import\s+(?!type\b)[^;]*?from\s*['"]aws-lambda['"]/m;
// A value import can also be spelled as a call, which the statement form above misses.
const AWS_LAMBDA_RUNTIME_LOAD = /(?:require|import)\(\s*['"]aws-lambda['"]/;
const AWS_SDK_IMPORT = /(?:from\s+|require\(\s*)['"]@aws-sdk\//;

describe('root entrypoint', () => {
  it('keeps utility exports available from the package root', () => {
    expect(awpaki).toHaveProperty('parseJsonBody');
    expect(awpaki).toHaveProperty('BadRequest');
    expect(awpaki).toHaveProperty('logApiGatewayEvent');
  });

  it('exposes one representative symbol of every re-exported module', () => {
    // A module missing from the barrel is invisible at compile time — this list is what
    // makes the omission fail a test instead of silently shrinking the public surface.
    expect(awpaki).toHaveProperty('parseJsonBody'); // parsers
    expect(awpaki).toHaveProperty('HttpError'); // errors
    expect(awpaki).toHaveProperty('extractEventParams'); // extractors
    expect(awpaki).toHaveProperty('isEmail'); // validators
    expect(awpaki).toHaveProperty('getLogger'); // loggers
    expect(awpaki).toHaveProperty('withRuntimeLogCollector'); // loggers/runtime-log-collector
    expect(awpaki).toHaveProperty('emailString'); // decoders
    expect(awpaki).toHaveProperty('cleanRecord'); // utils
    expect(awpaki).toHaveProperty('resolveRegion'); // environment
    expect(awpaki).toHaveProperty('defaultRetryOptions'); // constants
    expect(awpaki).toHaveProperty('createApiGatewayHandlerV2'); // handlers
  });

  it('keeps the test helpers out of the root barrel', () => {
    // `awpaki/testing` is scaffolding for a consumer's test suite; the root barrel is what
    // production code imports. Reachable by subpath only.
    expect(awpaki).not.toHaveProperty('createMockFetch');
    expect(awpaki).not.toHaveProperty('createMockEventV1');
    expect(awpaki).not.toHaveProperty('createMockEventV2');
    expect(awpaki).not.toHaveProperty('createMockContext');
  });

  it('does not export any optional AWS client from the package root', () => {
    // Derived from the clients barrel rather than hand-listed: a thirteenth client added
    // later is covered automatically, which a literal list is not. `Object.keys` reads the
    // property descriptors without invoking the lazy getters, so no SDK is loaded here.
    const clientNames = Object.keys(clients);
    const rootKeys = new Set(Object.keys(awpaki));

    expect(clientNames.length).toBeGreaterThanOrEqual(13);
    expect(clientNames.filter((name) => rootKeys.has(name))).toEqual([]);
  });

  it('exports nothing whose name looks like an AWS client', () => {
    // Catches a client re-exported under a name the barrel above does not know, which the
    // intersection check would miss.
    expect(Object.keys(awpaki).filter((key) => key.endsWith('Client'))).toEqual([]);
  });

  it('reaches no @aws-sdk package from any module the root barrel pulls in', () => {
    // Stronger than "no client is exported": no optional peer may even be referenced, so
    // importing awpaki stays free for an application that installed none of the AWS SDKs.
    const offenders = sourceFiles.filter((file) => AWS_SDK_IMPORT.test(readSource(file)));

    expect(offenders).toEqual([]);
  });

  it('imports aws-lambda as types only, everywhere outside src/clients', () => {
    // `aws-lambda` resolves to @types/aws-lambda: it has no runtime counterpart, so a
    // value import emits a require() that throws the moment the module is loaded.
    const offenders = sourceFiles.filter((file) => {
      const contents = readSource(file);

      return AWS_LAMBDA_VALUE_IMPORT.test(contents) || AWS_LAMBDA_RUNTIME_LOAD.test(contents);
    });

    expect(offenders).toEqual([]);
  });

  it('detects a value import of aws-lambda when there is one', () => {
    // Guards the guard: an assertion that can never fail is worse than no assertion.
    const value = ['import', "{ Context } from 'aws-lambda';"].join(' ');
    const typeOnly = ['import type', "{ Context } from 'aws-lambda';"].join(' ');
    const commentThenTypeOnly = `// this import is types only, see below\n${typeOnly}`;

    expect(AWS_LAMBDA_VALUE_IMPORT.test(value)).toBe(true);
    expect(AWS_LAMBDA_VALUE_IMPORT.test(typeOnly)).toBe(false);
    expect(AWS_LAMBDA_VALUE_IMPORT.test(commentThenTypeOnly)).toBe(false);
    expect(AWS_LAMBDA_RUNTIME_LOAD.test(['require(', "'aws-lambda')"].join(''))).toBe(true);
  });
});

describe('package subpath map', () => {
  interface PackageManifest {
    exports: Record<string, string | { types: string; import: string; require: string }>;
    typesVersions: Record<string, Record<string, string[]>>;
  }

  const manifest = JSON.parse(
    readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
  ) as PackageManifest;

  const subpaths = Object.keys(manifest.exports)
    .filter((key) => key !== '.' && key !== './package.json')
    .map((key) => key.slice('./'.length));

  const typesVersionKeys = Object.keys(manifest.typesVersions['*']);

  it('declares at least the modules that exist as barrels under src/', () => {
    const modulesOnDisk = readdirSync(__dirname).filter((entry) => {
      const full = join(__dirname, entry);

      return (
        statSync(full).isDirectory() &&
        entry !== 'clients' &&
        readdirSync(full).includes('index.ts')
      );
    });

    // Every top-level module directory must be reachable by its own subpath, otherwise a
    // consumer can only get to it through the root barrel.
    expect(subpaths).toEqual(expect.arrayContaining(modulesOnDisk));
  });

  it('keeps exports and typesVersions in sync', () => {
    // TypeScript below moduleResolution node16 reads `typesVersions`, everything else reads
    // `exports`: a subpath present in only one of them resolves for half the ecosystem.
    expect([...subpaths].sort()).toEqual([...typesVersionKeys].sort());
  });

  it('points every subpath at a build output that has a source counterpart', () => {
    for (const subpath of subpaths) {
      const entry = manifest.exports[`./${subpath}`];

      expect(typeof entry).toBe('object');

      if (subpath === 'clients') {
        // The aggregate barrel is CommonJS in both conditions: its lazy getters need a
        // synchronous `require`, which ESM does not have. Documented in docs/architecture.md.
        expect(entry).toEqual({
          types: './dist/cjs/clients/index.d.ts',
          import: './dist/cjs/clients/index.js',
          require: './dist/cjs/clients/index.js',
          default: './dist/cjs/clients/index.js',
        });
      } else {
        // `types` sits INSIDE each condition: a resolver that picks `import` must be handed
        // the ESM declarations, or it type-checks against the CommonJS ones.
        expect(entry).toEqual({
          import: {
            types: `./dist/esm/${subpath}/index.d.ts`,
            default: `./dist/esm/${subpath}/index.js`,
          },
          require: {
            types: `./dist/cjs/${subpath}/index.d.ts`,
            default: `./dist/cjs/${subpath}/index.js`,
          },
          // A resolver matching neither condition still gets a file rather than nothing.
          default: `./dist/cjs/${subpath}/index.js`,
        });
      }

      // node10 resolution ignores conditions entirely, so it reads the CommonJS build.
      expect(manifest.typesVersions['*'][subpath]).toEqual([`dist/cjs/${subpath}/index.d.ts`]);
      expect(statSync(join(__dirname, subpath, 'index.ts')).isFile()).toBe(true);
    }
  });

  it('serves the root barrel from both builds', () => {
    expect(manifest.exports['.']).toEqual({
      import: { types: './dist/esm/index.d.ts', default: './dist/esm/index.js' },
      require: { types: './dist/cjs/index.d.ts', default: './dist/cjs/index.js' },
      default: './dist/cjs/index.js',
    });
    expect(manifest.main).toBe('dist/cjs/index.js');
    expect(manifest.module).toBe('dist/esm/index.js');
    expect(manifest.types).toBe('dist/cjs/index.d.ts');
  });
});
