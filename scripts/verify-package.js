#!/usr/bin/env node
/**
 * Package-level smoke test: NOVO-4 of improvements.md.
 *
 * The jest suite runs against `src/`, where neither `files` nor `exports` exists — it
 * therefore cannot catch the two defects that shipped as awpaki 1.4.1 (a root barrel that
 * dragged in every optional AWS peer, and a subpath map that resolved nothing). This
 * script packs the tarball npm would publish, installs it into a throwaway project with
 * *no* AWS SDK present, and asserts what a consumer actually gets.
 *
 * Run with `npm run test:package` (builds first). Exits non-zero on the first failure.
 */

/* eslint-disable @typescript-eslint/no-require-imports -- plain CommonJS build script, not part of the published package */

const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

const repoRoot = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));

const failures = [];
const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  FAIL  ${name}\n          ${error.message.split('\n')[0]}`);
  }
};

const workdir = mkdtempSync(join(tmpdir(), 'awpaki-pkg-'));

try {
  // `npm pack` honours `files`, so what lands here is byte-for-byte what npm publishes.
  const tarball = execFileSync('npm', ['pack', '--pack-destination', workdir], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .pop();

  // Extracted rather than `npm install`ed on purpose: no network, and no chance of a
  // hoisted dependency from this repo leaking in and masking a missing peer.
  const pkgDir = join(workdir, 'node_modules', 'awpaki');
  mkdirSync(pkgDir, { recursive: true });
  execFileSync('tar', ['-xzf', join(workdir, tarball), '-C', pkgDir, '--strip-components=1']);
  writeFileSync(join(workdir, 'package.json'), JSON.stringify({ name: 'probe', private: true }));

  const run = (source) =>
    execFileSync(process.execPath, ['-e', source], { cwd: workdir, encoding: 'utf8' });

  console.log(`\nverifying ${tarball} with zero AWS SDK peers installed\n`);

  check('root barrel loads', () => {
    const out = run("const m = require('awpaki'); console.log(Object.keys(m).length)");
    if (Number(out.trim()) < 20) throw new Error(`root exported only ${out.trim()} symbols`);
  });

  check('root barrel exposes no AWS client', () => {
    const out = run(
      "console.log(Object.keys(require('awpaki')).filter((k) => k.endsWith('Client')).join(',') || 'none')"
    );
    if (out.trim() !== 'none') throw new Error(`root leaked clients: ${out.trim()}`);
  });

  const subpaths = Object.keys(manifest.exports).filter(
    (key) => key !== '.' && key !== './package.json'
  );
  const clientSubpaths = subpaths.filter((key) => key.startsWith('./clients/'));

  for (const subpath of subpaths.filter((key) => !key.startsWith('./clients/'))) {
    const spec = `awpaki${subpath.slice(1)}`;
    check(`${spec} resolves`, () => run(`require(${JSON.stringify(spec)})`));
  }

  // The aggregate barrel is lazy: importing it must cost nothing even with no SDK present.
  check('awpaki/clients loads lazily', () => {
    const out = run(
      "const c = require('awpaki/clients');" +
        "console.log(Object.keys(c).length, require.cache[require.resolve('awpaki/clients')] ? 'cached' : 'x')"
    );
    if (!out.startsWith('13')) throw new Error(`expected 13 client names, got: ${out.trim()}`);
  });

  check('a client missing its SDK fails with an actionable error, not undefined', () => {
    const out = run(
      "const c = require('awpaki/clients');" +
        "try { c.sqsClient.execute({}); console.log('NO THROW'); }" +
        'catch (e) { console.log(e.message); }'
    );
    if (!out.includes('@aws-sdk/client-sqs')) {
      throw new Error(`error did not name the missing package: ${out.trim()}`);
    }
    if (!out.includes('awpaki/clients/sqs')) {
      throw new Error(`error did not point at the direct subpath: ${out.trim()}`);
    }
  });

  for (const subpath of clientSubpaths) {
    const spec = `awpaki${subpath.slice(1)}`;
    check(`${spec} reports its missing peer by name`, () => {
      const out = run(
        `try { require(${JSON.stringify(spec)}); console.log('LOADED'); }` +
          "catch (e) { console.log(e.code + ' ' + (/'([^']+)'/.exec(e.message) || [])[1]); }"
      );
      if (out.trim() === 'LOADED') throw new Error('loaded without its peer installed');
      if (!out.includes('MODULE_NOT_FOUND') || !out.includes('@aws-sdk/')) {
        throw new Error(`unexpected failure: ${out.trim()}`);
      }
    });
  }
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\n${failures.length} package check(s) failed:\n${failures.join('\n')}`);
  process.exit(1);
}

console.log('\nall package checks passed');
