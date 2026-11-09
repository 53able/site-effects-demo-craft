#!/usr/bin/env node
import { lstat, realpath, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryUrl = 'https://canvasui.dev/r/liquid-object-react.json';
const licenseUrl = 'https://raw.githubusercontent.com/DavidHDev/canvas-ui/a0be3b7e1f42d0d1bafde470b6794b39f6729502/LICENSE.md';
const currentLicenseUrl = 'https://raw.githubusercontent.com/DavidHDev/canvas-ui/main/LICENSE.md';
const help = `Usage: node install-canvas-ui.mjs --project /path/to/react19-app [--component-dir src/components/swarm-demo] [--dry-run]
Fetches the official CanvasUI LiquidObject registry component and pinned license INTO YOUR APP.
Requires an existing React 19 application. Does not install packages or mount an effect.
Dry-run validates the target and fetches/checks content, but writes no files.`;
const hash = content => createHash('sha256').update(content).digest('hex');
async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Fetch failed (${response.status}): ${url}`);
  const text = await response.text();
  if (Buffer.byteLength(text) > 2_000_000) throw new Error(`Unexpectedly large response: ${url}`);
  return text;
}
try {
  const options = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--help' || key === '-h') { console.log(help); process.exit(0); }
    if (key === '--dry-run') options.dryRun = true;
    else if (['--project', '--component-dir'].includes(key) && args[i + 1] && !args[i + 1].startsWith('--')) options[key.slice(2)] = args[++i];
    else throw new Error(`Unknown or incomplete argument: ${key}`);
  }
  if (!options.project) throw new Error('--project is required');
  const project = path.resolve(options.project);
  if (!(await lstat(project)).isDirectory() || await realpath(project) !== project) throw new Error('Project must be a real directory without symlink ancestors');
  const repo = path.resolve(skill, '../..');
  if (project === repo || project.startsWith(repo + path.sep)) throw new Error('Choose a target application outside the skill repository');
  async function inspect(target) {
    for (let part = target; part !== project; part = path.dirname(part)) {
      const stat = await lstat(part).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
      if (stat?.isSymbolicLink()) throw new Error(`Refusing symlink: ${part}`);
      if (stat && part !== target && !stat.isDirectory()) throw new Error(`Not a directory: ${part}`);
    }
  }
  await inspect(path.join(project, 'package.json'));
  const pkg = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'));
  const react = pkg.dependencies?.react ?? pkg.devDependencies?.react;
  const reactDom = pkg.dependencies?.['react-dom'] ?? pkg.devDependencies?.['react-dom'];
  const is19 = version => typeof version === 'string' && /^[~^]?19\.\d+(?:\.\d+)?(?:-[\w.]+)?$/.test(version);
  if (!is19(react) || !is19(reactDom)) throw new Error('Unsupported application: declare React 19 and react-dom 19 in package.json (exact, ^ or ~ versions). No framework migration is performed.');
  const src = await lstat(path.join(project, 'src')).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
  const relative = options['component-dir'] ?? (src ? 'src/components/swarm-demo' : 'components/swarm-demo');
  if (!relative || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('--component-dir must be a safe relative directory');
  const destination = path.join(project, relative);
  for (const name of ['LiquidObject.tsx', 'CanvasUiEffect.tsx', 'LICENSE.canvas-ui.md', 'canvas-ui.manifest.json']) await inspect(path.join(destination, name));
  const [registryText, license, currentLicense, wrapper] = await Promise.all([fetchText(registryUrl), fetchText(licenseUrl), fetchText(currentLicenseUrl), readFile(path.join(skill, 'assets/CanvasUiEffect.tsx'), 'utf8')]);
  if (license !== currentLicense) throw new Error('Upstream CanvasUI license changed from the pinned revision; review the current license before installing');
  const registry = JSON.parse(registryText);
  if (registry.name !== 'liquid-object-react' || registry.files?.length !== 1 || registry.files[0].path !== 'components/canvasui/LiquidObject.tsx' || typeof registry.files[0].content !== 'string') throw new Error('Official registry schema changed; inspect it before installing');
  if (!license.includes('License') || !license.includes('Copyright')) throw new Error('Unexpected upstream license response');
  const component = registry.files[0].content;
  const manifest = JSON.stringify({
    renderer: 'canvas-ui/LiquidObject (three.js)',
    source: 'official manual registry installation; separate from Swarm Build',
    registry: { url: registryUrl, name: registry.name, sha256: hash(registryText), componentSha256: hash(component) },
    license: { url: licenseUrl, revision: 'a0be3b7e1f42d0d1bafde470b6794b39f6729502', sha256: hash(license), file: 'LICENSE.canvas-ui.md', currentVerification: { url: currentLicenseUrl, sha256: hash(currentLicense), matchesPinned: true } },
    dependencies: registry.dependencies, devDependencies: registry.devDependencies,
    files: ['LiquidObject.tsx', 'CanvasUiEffect.tsx', 'LICENSE.canvas-ui.md'],
  }, null, 2) + '\n';
  const files = Object.entries({ 'LiquidObject.tsx': component, 'CanvasUiEffect.tsx': wrapper, 'LICENSE.canvas-ui.md': license, 'canvas-ui.manifest.json': manifest });
  const pending = [];
  for (const [name, content] of files) {
    const target = path.join(destination, name);
    const existing = await readFile(target, 'utf8').catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (existing !== null && existing !== content) throw new Error(`Refusing to overwrite changed file: ${target}`);
    if (existing === null) pending.push({ target, content });
  }
  if (!options.dryRun) {
    await mkdir(destination, { recursive: true });
    for (const file of pending) await writeFile(file.target, file.content, { flag: 'wx' });
  }
  console.log(`${options.dryRun ? 'Would install' : 'Installed'} official CanvasUI source in ${destination}`);
  console.log(`Required packages: dependencies ${registry.dependencies.join(', ')}; devDependencies ${registry.devDependencies.join(', ')}. Install these in the target app with its package manager.`);
  console.log('Effect is not mounted. Import CanvasUiEffect and render it with your asset src and a sized style slot.');
} catch (error) { console.error(`install-canvas-ui: ${error.message}`); process.exitCode = 1; }
