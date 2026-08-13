#!/usr/bin/env node
/**
 * Stamps each build directory with the module format of its files.
 *
 * Node decides whether a `.js` file is CommonJS or an ES module from the nearest
 * package.json, and this package has no top-level `"type"`. Without these markers every file
 * under `dist/esm` would be read as CommonJS and fail on its first `import` statement.
 *
 * Run by `npm run build`, after both tsc passes.
 */

/* eslint-disable @typescript-eslint/no-require-imports -- plain CommonJS build script, not part of the published package */

const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

/**
 * Writes the `package.json` marker of one build directory.
 *
 * @param {string} dir - Directory to stamp, relative to the repository root
 * @param {'commonjs' | 'module'} type - Module format of the files it contains
 * @returns {void}
 */
function writeMarker(dir, type) {
  const target = join(__dirname, '..', dir);
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'package.json'), `${JSON.stringify({ type }, null, 2)}\n`);
}

writeMarker('dist/cjs', 'commonjs');
writeMarker('dist/esm', 'module');
