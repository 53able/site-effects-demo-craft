import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const scripts = path.join(root, 'skills/site-effects-demo-craft/scripts');
function fixture(t) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'swarm-install-test-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function run(script, args, preload) {
  return spawnSync(process.execPath, [...(preload ? ['--import', preload] : []), path.join(scripts, script), ...args], { encoding: 'utf8' });
}

test('dry-run writes nothing', t => {
  const dir = fixture(t);
  const result = run('install-local.mjs', ['--project', dir, '--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(path.join(dir, 'public')), false);
});

test('runtime install is idempotent and retains all MIT copyright notices', t => {
  const dir = fixture(t);
  for (let i = 0; i < 2; i++) {
    const result = run('install-local.mjs', ['--project', dir]);
    assert.equal(result.status, 0, result.stderr);
  }
  const license = readFileSync(path.join(dir, 'public/swarm-demo/LICENSE'), 'utf8');
  assert.match(license, /Ha Nguyen/);
  assert.match(license, /53able/);
  assert.match(license, /Permission is hereby granted/);
  assert.ok(readFileSync(path.join(dir, 'public/swarm-demo/swarm-build.js')).length > 1000);
});

test('changed application files are never overwritten', t => {
  const dir = fixture(t);
  mkdirSync(path.join(dir, 'public/swarm-demo'), { recursive: true });
  const target = path.join(dir, 'public/swarm-demo/swarm-demo.js');
  writeFileSync(target, 'application customization');
  const result = run('install-local.mjs', ['--project', dir]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /overwrite/);
  assert.equal(readFileSync(target, 'utf8'), 'application customization');
  assert.equal(existsSync(path.join(dir, 'public/swarm-demo/swarm-build.js')), false);
});

test('path traversal and repository targets fail before writing', t => {
  const dir = fixture(t);
  assert.notEqual(run('install-local.mjs', ['--project', dir, '--public-dir', '../outside']).status, 0);
  assert.notEqual(run('install-local.mjs', ['--project', root]).status, 0);
  assert.equal(existsSync(path.join(dir, 'public')), false);
});

test('a symlink in the output path cannot redirect writes', t => {
  const dir = fixture(t);
  const outside = fixture(t);
  symlinkSync(outside, path.join(dir, 'public'), 'dir');
  const result = run('install-local.mjs', ['--project', dir]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /symlink/);
  assert.equal(existsSync(path.join(outside, 'swarm-demo')), false);
});

test('Canvas UI installer rejects unsupported React without migration', t => {
  const dir = fixture(t);
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { react: '18.3.1', 'react-dom': '18.3.1' } }));
  const result = run('install-canvas-ui.mjs', ['--project', dir]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /React 19/);
  assert.equal(existsSync(path.join(dir, 'components')), false);
});

test('Canvas UI license changes fail closed before writing component files', t => {
  const dir = fixture(t);
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { react: '^19.2.4', 'react-dom': '^19.2.4' } }));
  const preload = path.join(dir, 'fetch-fixture.mjs');
  writeFileSync(preload, `globalThis.fetch = async url => new Response(String(url).includes('/r/') ? JSON.stringify({name:'liquid-object-react',files:[{path:'components/canvasui/LiquidObject.tsx',content:'fixture component'}],dependencies:['three'],devDependencies:['@types/three']}) : String(url).includes('/main/') ? 'Copyright changed License' : 'Copyright pinned License');`);
  const result = run('install-canvas-ui.mjs', ['--project', dir], preload);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /license/i);
  assert.equal(existsSync(path.join(dir, 'components')), false);
});
