/* Site adapter for the MIT Swarm Build runtime. Load swarm-build.js first. */
(function () {
  'use strict';
  const script = document.currentScript;
  const semantic = 'h1,h2,h3,h4,h5,h6,p,img,picture,svg,button,a,input,textarea,select';
  const ignored = '[data-swarm-ignore],[data-swarm-overlay],script,style,template,noscript,[hidden],[aria-hidden="true"]';
  let instance = null;
  let nodes = [];
  let built = new Set();
  let generation = 0;
  let settings = {};
  let failure = null;
  let status = 'idle';

  function rendered(node) {
    if (!node.isConnected || node.closest(ignored)) return false;
    if (node.checkVisibility && !node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    for (let parent = node; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent);
      if (css.display === 'none' || css.visibility === 'hidden' || css.visibility === 'collapse' || Number(css.opacity) === 0) return false;
    }
    const r = node.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function selectBlocks(root) {
    const explicit = Array.from(root.querySelectorAll('[data-swarm-block]')).filter(rendered);
    if (explicit.length) return explicit;
    const leaves = Array.from(root.querySelectorAll(semantic)).filter(node => {
      if (!rendered(node)) return false;
      if (node.matches('picture')) return true;
      if (node.matches('img,svg,input,textarea,select')) return !node.closest('picture');
      // Keep mixed-content parents (paragraph + link, button + icon) too:
      // their own text/background must not bypass the build just because a child is selected.
      return node.matches('picture') || Boolean(node.textContent.trim());
    });
    const selected = new Set(leaves);
    for (const leaf of leaves) {
      for (let parent = leaf.parentElement; parent && parent !== root && parent !== document.body; parent = parent.parentElement) {
        if (!parent.matches('article,li,div,section') || !rendered(parent) || !parent.querySelector(semantic)) continue;
        const css = getComputedStyle(parent);
        const paint = css.backgroundColor !== 'transparent' && css.backgroundColor !== 'rgba(0, 0, 0, 0)' || css.backgroundImage !== 'none' || ['Top', 'Right', 'Bottom', 'Left'].some(side => parseFloat(css[`border${side}Width`]) > 0 && css[`border${side}Style`] !== 'none');
        if (paint) { selected.add(parent); break; }
      }
    }
    // Runtime discovers parent dependencies from this document order.
    return Array.from(selected).sort((a, b) => a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  }
  function visible(node) {
    // Runtime temporarily clips/inerts pending blocks; do not use checkVisibility here.
    const r = node.getBoundingClientRect();
    return node.isConnected && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  }
  function debug() {
    const current = nodes.filter(visible);
    return { status, total: nodes.length, completed: built.size, visible: current.length, visiblePending: current.filter(node => !built.has(node)).length, error: failure?.message ?? null, runtime: window.__swarm ?? null };
  }
  function destroy() {
    generation++;
    instance?.destroy();
    instance = null;
    status = 'destroyed';
  }
  function start(options = {}) {
    if (typeof window.SwarmBuild?.swarmBuildPage !== 'function') throw new Error('Load /swarm-demo/swarm-build.js before starting SwarmDemo');
    destroy();
    settings = { ...options };
    const root = options.root ?? document;
    nodes = selectBlocks(root);
    built = new Set();
    failure = null;
    status = 'running';
    const token = generation;
    const { root: unusedRoot, onTaskBuilt, onDone, ...runtimeOptions } = options;
    instance = window.SwarmBuild.swarmBuildPage(nodes, {
      agents: 'auto', routing: 'role', pick: 'urgent', stealAfter: 0.25,
      pipeline: true, sizeTiming: true, ...runtimeOptions,
      // Drawing below the viewport is intentionally disabled for demos.
      lookahead: 0,
      viewportRatio: 1,
      onTaskBuilt(task) { if (token === generation) built.add(task.node); onTaskBuilt?.(task); },
      onDone() { onDone?.(); },
    });
    instance.finished.then(() => {
      if (token !== generation) return;
      nodes.forEach(node => built.add(node));
      status = 'completed';
    }, error => { if (token === generation) { failure = error; status = 'failed'; } });
    return instance;
  }
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  function active(token) {
    if (generation !== token || !instance) throw new Error('SwarmDemo tour cancelled');
    if (failure) throw failure;
  }
  async function waitForVisible({ timeout = 30000, token = generation } = {}) {
    const deadline = performance.now() + timeout;
    while (true) {
      active(token);
      const pending = nodes.filter(node => visible(node) && !built.has(node));
      if (!pending.length) return debug();
      if (performance.now() >= deadline) throw new Error(`SwarmDemo tour timed out: ${pending.length} visible blocks unfinished`);
      await pause(50);
    }
  }
  async function tour({ timeout = 30000, hold = 400, step = 0.65, scrollTimeout = 5000 } = {}) {
    if (!instance) start();
    if (![timeout, hold, step, scrollTimeout].every(Number.isFinite) || timeout <= 0 || hold < 0 || step <= 0 || step > 1 || scrollTimeout <= 0) throw new Error('Invalid tour timing or step (step must be > 0 and <= 1)');
    const token = generation;
    while (true) {
      await waitForVisible({ timeout, token });
      await pause(hold);
      // Recheck after the hold, including content exposed by layout changes.
      await waitForVisible({ timeout, token });
      const bottom = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      if (scrollY >= bottom - 1) return debug();
      const target = Math.min(bottom, scrollY + innerHeight * step);
      window.scrollTo({ top: target, behavior: 'smooth' });
      const deadline = performance.now() + scrollTimeout;
      while (Math.abs(scrollY - target) > 2) {
        active(token);
        if (performance.now() >= deadline) throw new Error('SwarmDemo tour scroll timed out');
        await pause(50);
      }
      await pause(100);
    }
  }
  window.SwarmDemo = {
    start, replay: () => start(settings), destroy,
    finish() { instance?.finish(); },
    setSpeed(speed) { if (!Number.isFinite(speed) || speed <= 0) throw new Error('Speed must be positive'); settings.speed = speed; instance?.setSpeed(speed); },
    waitForVisible, tour, debug,
    get finished() { return instance?.finished ?? Promise.resolve(); },
  };
  if (script?.getAttribute('data-autostart') === 'true') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => start(), { once: true });
    else start();
  }
})();
