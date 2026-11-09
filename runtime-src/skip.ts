// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.

export function shouldSkip(nodes: Element[]): boolean {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // The CSS fallback already showed the content: too late to build it.
  const fallbackShown = nodes.some((node) =>
    node
      .getAnimations?.()
      .some((a) => (a as CSSAnimation).animationName === "swarm-build-fallback" && a.playState === "finished"),
  );
  return reduced || fallbackShown || nodes.length === 0;
}
