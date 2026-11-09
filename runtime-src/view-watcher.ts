// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.

/**
 * True when an ancestor that clips its overflow hides `node`'s top edge (where the observer sees a
 * hidden block) while some of the block shows inside it and the viewport.
 */
function topClipped(node: Element, r: DOMRect): boolean {
  let clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  for (let p = node.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
    const b = p.getBoundingClientRect();
    clip = {
      left: Math.max(clip.left, b.left),
      top: Math.max(clip.top, b.top),
      right: Math.min(clip.right, b.right),
      bottom: Math.min(clip.bottom, b.bottom),
    };
  }
  const shows = Math.min(r.right, clip.right) > Math.max(r.left, clip.left) && Math.min(r.bottom, clip.bottom) > Math.max(r.top, clip.top);
  const edge = r.top >= clip.top && r.top < clip.bottom && Math.min(r.right, clip.right) > Math.max(r.left, clip.left);
  return shows && !edge;
}

/** How often (in frames) the watcher looks again at unseen blocks without a scroll. */
export const POLL_FRAMES = 12;

/**
 * Marks tasks as seen when their element scrolls into view. `lookahead` (viewport heights) moves
 * the line a block's top must pass from 90% of the viewport down by that much: 0.5 marks blocks
 * up to half a screen below the viewport as seen.
 */
export function viewWatcher<T extends { seen: boolean; parent?: { built?: boolean } }>(
  tasks: T[],
  nodeOf: (task: T) => Element,
  lookahead = 0,
  viewportRatio = 0.9,
) {
  const ahead = Math.max(0, lookahead);
  const ratio = Number.isFinite(viewportRatio) ? Math.min(1, Math.max(0, viewportRatio)) : 0.9;
  return (wake: () => void): (() => void) => {
    const byNode = new Map<Element, T[]>();
    tasks.forEach((t) => {
      const node = nodeOf(t);
      if (!byNode.has(node)) byNode.set(node, []);
      byNode.get(node)!.push(t);
    });
    // A block counts as in view once its top is above a line at 90% of the viewport (with
    // look-ahead, that many viewport heights lower). Near the end of the page a block's top may
    // never get there: once the page is scrolled to the end, or the scroll left cannot bring its
    // top above that line, it counts as seen while any of it is in view. Otherwise the last
    // blocks of a page stay hidden for good.
    const line = () => innerHeight * (ratio + ahead);
    const stuck = (r: DOMRect, left: number) => left <= 2 || r.top - left > line();
    // A block inside a block that is still hidden is clipped away by its parent's clip-path, so
    // the observer never reports it in view. It counts as seen once its box is in the same area
    // (the viewport less its bottom 10%); otherwise a visitor who scrolls past before the parent
    // is built leaves it unbuilt for good.
    const check = () => {
      let seen = false;
      // The scroll left below the viewport, measured once per check.
      const root = document.scrollingElement ?? document.documentElement;
      const left = root.scrollHeight - innerHeight - scrollY;
      byNode.forEach((list, node) => {
        if (list.every((t) => t.seen)) return;
        const held = list.some((t) => !t.seen && t.parent && !t.parent.built);
        const r = node.getBoundingClientRect();
        if (r.bottom <= 0 || r.right < 0 || r.left > innerWidth || r.top >= Math.max(innerHeight, line())) return;
        if (r.top > line() && !stuck(r, left)) return;
        // The observer sees a hidden block as its clip-path leaves it: a line at its top edge. A
        // block whose top is above the viewport (a tall card scrolled half past, or one sliding
        // in sideways below that point) is never reported, so it counts here.
        // Unless an ancestor that clips its overflow hides that line while part of the block shows
        // (a floating decoration bleeding out of its section): the observer never reports it.
        if (r.top >= 0 && r.top <= line() && !held && !stuck(r, left) && !topClipped(node, r)) return;
        list.forEach((t) => (t.seen = true));
        io.unobserve(node);
        seen = true;
      });
      return seen;
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          byNode.get(e.target)?.forEach((t) => (t.seen = true));
          io.unobserve(e.target);
        }
        check();
        wake();
      },
      { rootMargin: `0px 0px ${Math.round((ratio + ahead - 1) * 100)}% 0px` },
    );
    byNode.forEach((_, node) => io.observe(node));
    // Scroll events can come many times a frame: one check per frame is enough.
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (check()) wake();
      });
    };
    addEventListener("scroll", onScroll, { capture: true, passive: true });
    // Without a scroll the page can still change under a block the observer cannot report: one
    // held while its parent was hidden whose parent is now built, or one moved by a CSS animation
    // (a floating decoration). Look again every POLL_FRAMES frames while any block is unseen.
    let poll = 0;
    let frames = 0;
    const tick = () => {
      poll = 0;
      if (++frames % POLL_FRAMES === 0 && check()) wake();
      if (tasks.some((t) => !t.seen)) poll = requestAnimationFrame(tick);
    };
    poll = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(poll);
      io.disconnect();
      removeEventListener("scroll", onScroll, { capture: true });
    };
  };
}
