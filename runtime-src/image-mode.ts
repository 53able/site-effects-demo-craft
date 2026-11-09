// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.

import { inset } from "./clip";
import { el, imageSource } from "./dom";
import { easeOut } from "./easing";
import type { TweenFn } from "./loop";
import { autoRegions, parseRegions } from "./regions";
import { runSwarm, skip } from "./run-swarm";
import { shouldSkip } from "./skip";
import type { Options, Region, SwarmBuild, SwarmTask, Target, TaskRect } from "./types";
import { viewWatcher } from "./view-watcher";

interface Item {
  node: HTMLElement;
  regions: Region[];
  src: string;
}

interface ImageTask extends SwarmTask {
  item: Item;
  target: number;
  region: Region;
}

function normalizeImages(targets: Target | (Target | null | undefined)[] | null | undefined): Item[] {
  const list = (Array.isArray(targets) ? targets : [targets]).filter((t): t is Target => Boolean(t));
  return list.flatMap((t) => {
    const node = (t instanceof Element ? t : t.el) as HTMLElement | undefined;
    if (!node?.parentElement) return [];
    const given = t instanceof Element ? null : t.regions;
    const parsed = node.dataset.swarmRegions ? parseRegions(node.dataset.swarmRegions) : [];
    const regions = given?.length ? given : parsed.length ? parsed : autoRegions();
    const src = (t instanceof Element ? null : t.src) || imageSource(node);
    if (!src) {
      console.warn("swarm-build: no image URL for", node);
      return [];
    }
    return [{ node, regions, src }];
  });
}

/** The image paints in its content box; tasks measure against that. */
function contentBox(node: Element): TaskRect {
  const cs = getComputedStyle(node);
  const px = (v: string) => parseFloat(v) || 0;
  const r = node.getBoundingClientRect();
  const l = px(cs.borderLeftWidth) + px(cs.paddingLeft);
  const t = px(cs.borderTopWidth) + px(cs.paddingTop);
  const width = r.width - l - px(cs.borderRightWidth) - px(cs.paddingRight);
  const height = r.height - t - px(cs.borderBottomWidth) - px(cs.paddingBottom);
  return { left: r.left + l, top: r.top + t, width, height, bottom: r.top + t + height };
}

/**
 * Builds each target image region by region: a blank canvas covers the image and each region
 * of it sweeps in after a cursor drags its box. `finished` always resolves. `onDone` runs once
 * when the build completes or `finish()` is called, never after `destroy()`.
 */
export function swarmBuild(
  targets: Target | (Target | null | undefined)[] | null | undefined,
  options: Options = {},
): SwarmBuild {
  const items = normalizeImages(targets);
  const unpend = () => items.forEach(({ node }) => node.removeAttribute("data-swarm-pending"));
  if (shouldSkip(items.map((i) => i.node))) return skip(unpend, options.onDone);
  const { canvas = "white" } = options;
  const layers: { cover: HTMLElement; tiles: Map<ImageTask, HTMLElement> }[] = [];
  const places: (() => void)[] = [];
  const tasks: ImageTask[] = items.flatMap((item, target) =>
    item.regions.map((region) => {
      const { node } = item;
      const { x, y, w, h } = region;
      const task: ImageTask = {
        item,
        target,
        region,
        seen: false,
        rect: () => {
          const b = contentBox(node);
          const r = { left: b.left + (x / 100) * b.width, top: b.top + (y / 100) * b.height };
          return { ...r, width: (w / 100) * b.width, height: (h / 100) * b.height, bottom: r.top + (h / 100) * b.height };
        },
        size: () => {
          const img = node as HTMLImageElement;
          return {
            width: ((img.naturalWidth || node.offsetWidth) * w) / 100,
            height: ((img.naturalHeight || node.offsetHeight) * h) / 100,
          };
        },
        reveal: (tween) =>
          tween(0.45, (t) => (layers[target].tiles.get(task)!.style.clipPath = inset(region, easeOut(t) * h))),
      };
      return task;
    }),
  );

  // Per image, inside its parent so the parent's rounded corners clip it: a blank canvas plus
  // one tile of the image per region.
  const prepare = () => {
    const parents = new Map<HTMLElement, string>();
    const undo: (() => void)[] = [];
    items.forEach(({ node, src }, target) => {
      const parent = node.parentElement!;
      if (!parents.has(parent)) {
        parents.set(parent, parent.style.position);
        if (["static", ""].includes(getComputedStyle(parent).position)) parent.style.position = "relative";
      }
      const layer = el("div", { position: "absolute", pointerEvents: "none", zIndex: "1", overflow: "hidden" });
      layer.setAttribute("aria-hidden", "true");
      node.after(layer);
      const place = () => {
        const b = contentBox(node);
        const p = parent.getBoundingClientRect();
        Object.assign(layer.style, {
          left: `${b.left - p.left - parent.clientLeft + parent.scrollLeft}px`,
          top: `${b.top - p.top - parent.clientTop + parent.scrollTop}px`,
          width: `${b.width}px`,
          height: `${b.height}px`,
          borderRadius: getComputedStyle(node).borderRadius,
        });
      };
      place();
      places.push(place);
      const observer = new ResizeObserver(place);
      observer.observe(node);
      const cover = el("div", { position: "absolute", inset: "0", background: canvas }, layer);
      const tiles = new Map<ImageTask, HTMLElement>();
      tasks
        .filter((t) => t.target === target)
        .forEach((t) =>
          tiles.set(
            t,
            el(
              "div",
              {
                position: "absolute",
                inset: "0",
                backgroundImage: `url(${JSON.stringify(src)})`,
                backgroundSize: "100% 100%",
                clipPath: inset(t.region, 0),
              },
              layer,
            ),
          ),
        );
      layers[target] = { cover, tiles };
      undo.push(() => {
        observer.disconnect();
        layer.remove();
      });
    });
    unpend();
    return () => {
      undo.forEach((fn) => fn());
      parents.forEach((position, parent) => (parent.style.position = position));
    };
  };

  const settleAll = (tween: TweenFn) =>
    tween(0.4, (t) => layers.forEach(({ cover }) => (cover.style.opacity = String(1 - t))));
  return runSwarm(tasks, {
    prepare,
    observe: viewWatcher(tasks, (t) => t.item.node, options.lookahead),
    settleAll,
    unpend,
    onFrame: () => places.forEach((place) => place()),
    options: { start: "visible", ...options },
  });
}
