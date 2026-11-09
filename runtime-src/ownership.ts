// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.

interface Held {
  clip: string;
  inert: boolean;
  count: number;
}

/** Each block's own clip-path, kept while any swarm holds it, so overlapping swarms restore it once. */
const owned = new WeakMap<Element, Held>();

export function hold(node: HTMLElement): Held {
  const entry = owned.get(node) ?? { clip: node.style.clipPath, inert: node.inert, count: 0 };
  entry.count++;
  owned.set(node, entry);
  return entry;
}

export function release(node: HTMLElement): void {
  const entry = owned.get(node);
  if (!entry || --entry.count > 0) return;
  owned.delete(node);
  node.style.clipPath = entry.clip;
  node.inert = entry.inert;
}

/** How many swarms hold `node` right now (0 when none). */
export function heldCount(node: Element): number {
  return owned.get(node)?.count ?? 0;
}
