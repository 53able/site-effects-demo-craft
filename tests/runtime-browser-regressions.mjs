// Run in a test page after the shipped runtime and adapter are loaded.
export async function runRuntimeRegressions() {
  const api = window.SwarmBuild;
  const demo = window.SwarmDemo;
  const results = [];
  const fixtures = [];
  const check = (value, message) => { if (!value) throw new Error(message); };
  const bounded = async promise => {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Regression timeout')), 6000); })]); }
    finally { clearTimeout(timer); }
  };
  const make = html => {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;left:20px;top:20px;width:300px;z-index:100;';
    root.innerHTML = html;
    document.body.append(root);
    fixtures.push(root);
    return root;
  };
  demo.destroy();
  api.setRendererFactory(() => ({ frame() {}, dispose() {} }));
  try {
    for (const phase of ['reveal', 'onTaskBuilt', 'onDone']) {
      const root = make('<div style="width:280px;height:80px"><b>Failure fixture</b></div>');
      const node = root.firstElementChild;
      const error = new Error(`Expected ${phase} failure`);
      let done = 0;
      const options = { speed: 200, headcount: 1, onDone() { done++; } };
      if (phase === 'reveal') options.reveal = { kind: 'band', async reveal() { throw error; } };
      if (phase === 'onTaskBuilt') options.onTaskBuilt = () => { throw error; };
      if (phase === 'onDone') options.onDone = () => { throw error; };
      const instance = api.swarmBuildPage([node], options);
      let rejected;
      try { await bounded(instance.finished); } catch (failure) { rejected = failure; }
      finally { instance.destroy(); }
      check(rejected === error, `${phase} must reject finished with its real error`);
      check(done === 0, `${phase} must not invoke successful onDone`);
      check(node.style.clipPath === '' && !node.inert, `${phase} must restore the target`);
      root.remove();
      results.push(`${phase}: rejects and cleans up`);
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    const spacer = document.createElement('div');
    spacer.style.height = '5000px';
    document.body.append(spacer);
    fixtures.push(spacer);
    const strip = make('<div data-swarm-block style="position:fixed;left:20px;top:95vh;width:280px;height:12px"><b>Bottom strip</b></div>');
    demo.start({ root: strip, speed: 200, headcount: 1 });
    await bounded(demo.waitForVisible({ timeout: 5000 }));
    await bounded(demo.finished);
    check(demo.debug().completed === 1, 'Visible bottom strip must build before scrolling');
    results.push('bottom 10%: eligible without offscreen lookahead');
    demo.destroy();
    strip.remove();
    spacer.remove();

    const mixed = make('<p>Outside text <a href="#">Link</a></p><button>Label <svg width="20" height="20"><rect width="20" height="20"/></svg></button>');
    demo.start({ root: mixed, speed: 200, headcount: 2 });
    await bounded(demo.finished);
    check(demo.debug().total === 4, 'Paragraph, link, button and icon must each be covered');
    results.push('mixed semantic parents: text and controls stay covered');
    return results;
  } finally {
    demo.destroy();
    fixtures.forEach(node => node.remove());
    api.setRendererFactory(null);
  }
}
