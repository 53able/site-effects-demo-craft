#!/usr/bin/env node
import { lstat, realpath, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const help = `Usage: node install-local.mjs --project /path/to/site [--public-dir public] [--dry-run]
Copies the real Swarm Build runtime, adapter and MIT license into public/swarm-demo.
Load /swarm-demo/swarm-build.js before /swarm-demo/swarm-demo.js, then call SwarmDemo.start().
Add data-autostart="true" to the adapter script for explicit automatic startup.`;
try {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--help' || key === '-h') { console.log(help); process.exit(0); }
    if (key === '--dry-run') options.dryRun = true;
    else if (['--project', '--public-dir'].includes(key) && args[i + 1] && !args[i + 1].startsWith('--')) options[key.slice(2)] = args[++i];
    else throw new Error(`Unknown or incomplete argument: ${key}`);
  }
  if (!options.project) throw new Error('--project is required');
  const project = path.resolve(options.project);
  if (!(await lstat(project)).isDirectory() || await realpath(project) !== project) throw new Error('Project must be a real directory without symlink ancestors');
  const repo = path.resolve(skill, '../..');
  if (project === repo || project.startsWith(repo + path.sep)) throw new Error('Choose a target site outside the skill repository');
  const publicDir = options['public-dir'] ?? 'public';
  if (!publicDir || path.isAbsolute(publicDir) || publicDir.split(/[\\/]/).some(p => !p || p === '.' || p === '..') || publicDir.includes('\\')) throw new Error('--public-dir must be a safe relative directory');
  const destination = path.join(project, publicDir, 'swarm-demo');
  const entries = [['runtime/swarm-build.js', 'swarm-build.js'], ['swarm-demo.js', 'swarm-demo.js'], ['runtime/LICENSE', 'LICENSE']];
  const files = [];
  for (const [source, name] of entries) {
    const target = path.join(destination, name);
    const content = await readFile(path.join(skill, 'assets', source));
    for (let part = target; part !== project; part = path.dirname(part)) {
      const stat = await lstat(part).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
      if (stat?.isSymbolicLink()) throw new Error(`Refusing symlink: ${part}`);
      if (stat && part !== target && !stat.isDirectory()) throw new Error(`Not a directory: ${part}`);
    }
    const existing = await readFile(target).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (existing && !existing.equals(content)) throw new Error(`Refusing to overwrite changed file: ${target}`);
    files.push({ target, content, exists: existing !== null });
  }
  if (!options.dryRun) {
    await mkdir(destination, { recursive: true });
    for (const file of files) if (!file.exists) await writeFile(file.target, file.content, { flag: 'wx' });
  }
  console.log(`${options.dryRun ? 'Would install' : 'Installed'} Swarm Build in ${destination}`);
  console.log('Load the runtime before the adapter. Startup is explicit; use SwarmDemo.start() or data-autostart="true".');
} catch (error) { console.error(`install-local: ${error.message}`); process.exitCode = 1; }
