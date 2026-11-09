// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.

import { HIDDEN } from "./clip";
import { el, typeable } from "./dom";
import { heldCount, hold, release } from "./ownership";
import { bandReveal } from "./reveal/band-reveal";
import { cssFallback } from "./reveal/css-fallback";
import { chooseReveal, hasTransform } from "./reveal/strategy";
import { blockFeatures, classifyRole } from "./roles";
import { runSwarm, skip } from "./run-swarm";
import { shouldSkip } from "./skip";
import type { PageOptions, SwarmBuild, SwarmTask } from "./types";
import { viewWatcher } from "./view-watcher";

interface PageTask extends SwarmTask {
  node: HTMLElement;
  text: string | null;
  clip: string;
  inert: boolean;
  restore: (() => void) | null;
}

/**
 * Builds live page elements in place. Every block is hidden, then a cursor drags out its box and
 * it sweeps in; plain-text blocks type themselves in. A block inside another block waits for it.
 * Blocks below the fold wait until they scroll into view.
 */
export function swarmBuildPage(
  blocks: string | Element[] | NodeListOf<Element> | null = "[data-swarm-block]",
  options: PageOptions = {},
): SwarmBuild {
  // Unique, connected and rendered: a display:none block would never scroll into view.
  const list = typeof blocks === "string" ? document.querySelectorAll(blocks) : (blocks ?? []);
  const nodes = [...new Set(list)].filter(
    (n): n is HTMLElement => n instanceof Element && n.isConnected && n.checkVisibility?.() !== false,
  );
  const unpend = () => nodes.forEach((n) => n.removeAttribute("data-swarm-pending"));
  if (shouldSkip(nodes)) return skip(unpend, options.onDone);
  const typeSpeed = (options.typeSpeed ?? 0) > 0 ? options.typeSpeed! : 1;
  const strategy = options.reveal ?? bandReveal;
  // Document order is reading order: top to bottom, parents before children.
  const byNode = new Map<Element, PageTask>();
  const tasks: PageTask[] = nodes.map((node) => {
    const text = typeable(node);
    const task: PageTask = {
      node,
      seen: false,
      text,
      role: classifyRole(blockFeatures(node, text !== null)),
      clip: "",
      inert: false,
      restore: null,
      radius: getComputedStyle(node).borderRadius,
      rect: () => node.getBoundingClientRect(),
      // An <svg> block has no offset size: its box is its rect.
      size: () => {
        const box: Element = node;
        if (box instanceof HTMLElement) return { width: box.offsetWidth, height: box.offsetHeight };
        const r = box.getBoundingClientRect();
        return { width: Math.round(r.width), height: Math.round(r.height) };
      },
      reveal: async (tween, hooks) => {
        // Focusable again as soon as it starts to show, unless another swarm still hides it.
        if (heldCount(node) === 1) node.inert = task.inert;
        // Decided once, as the task starts: a transform found later would not move its glow.
        const path = chooseReveal({
          typing: task.text !== null,
          transformed: () => hasTransform(node),
          overlayLost: hooks.overlayLost(),
        });
        if (path !== "caret") {
          const chosen = path === "css" ? cssFallback : strategy;
          hooks.count(chosen.kind);
          await chosen.reveal({ node, tween, progress: (e) => hooks.band(e), zIndex: hooks.zIndex });
          hooks.band(null);
          node.style.clipPath = task.clip;
          return;
        }
        // Type into one span holding a transparent copy of the rest, so the block keeps its size
        // and a flex block still has a single child.
        const original = [...node.childNodes];
        const typed = document.createTextNode("");
        const rest = el("span", { color: "transparent" });
        const line = el("span");
        line.append(typed, rest);
        node.replaceChildren(line);
        node.style.clipPath = task.clip;
        const text = task.text!;
        const restore = () => node.replaceChildren(...original);
        task.restore = restore;
        hooks.caret(typed);
        await tween(Math.min(1.6, 0.15 + text.length * 0.03) / typeSpeed, (t) => {
          const n = Math.round(t * text.length);
          typed.data = text.slice(0, n);
          rest.textContent = text.slice(n);
        });
        hooks.caret(null);
        restore();
        task.restore = null;
      },
    };
    byNode.set(node, task);
    return task;
  });
  tasks.forEach((task) => {
    for (let p = task.node.parentElement; p && !task.parent; p = p.parentElement) task.parent = byNode.get(p);
  });

  const prepare = () => {
    tasks.forEach((t) => {
      ({ clip: t.clip, inert: t.inert } = hold(t.node));
      t.node.style.clipPath = HIDDEN;
      // Hidden blocks are out of the tab order and the accessibility tree.
      t.node.inert = true;
    });
    unpend();
    return () => {
      tasks.forEach((t) => {
        t.restore?.();
        release(t.node);
      });
    };
  };

  return runSwarm(tasks, {
    prepare,
    observe: viewWatcher(tasks, (t) => t.node, options.lookahead, options.viewportRatio),
    settleAll: async () => {},
    unpend,
    options,
  });
}
