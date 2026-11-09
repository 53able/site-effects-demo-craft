// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.

import { sweep, sweepFront } from "../clip";
import { el } from "../dom";
import { easeOut } from "../easing";
import { GOLD_TOKEN } from "../theme-fallback";
import { SWEEP_SECONDS } from "./band-reveal";
import type { RevealStrategy } from "./strategy";

/** Height of the gold glow above the sweep front, in px. */
const GLOW = 28;

/**
 * The same clip sweep, with a gold gradient at its front drawn by a fixed div of its own rather
 * than the overlay: for transformed blocks and after the overlay's context is lost. The div is
 * at the overlay's z-index and the block's own styles (position included) are never touched.
 */
export const cssFallback: RevealStrategy = {
  kind: "css",
  async reveal({ node, tween, zIndex }) {
    const glow = el("div", {
      position: "fixed",
      left: "0",
      top: "0",
      height: `${GLOW}px`,
      pointerEvents: "none",
      zIndex: String(zIndex),
      background: `linear-gradient(to bottom, transparent, color-mix(in srgb, ${GOLD_TOKEN} 55%, transparent) 85%, ${GOLD_TOKEN})`,
      opacity: "0",
    });
    glow.setAttribute("aria-hidden", "true");
    glow.setAttribute("data-swarm-fallback", "");
    document.body.appendChild(glow);
    try {
      await tween(SWEEP_SECONDS, (t) => {
        const e = easeOut(t);
        node.style.clipPath = sweep(e);
        const { visible, frontY } = sweepFront(node.getBoundingClientRect(), e);
        const top = Math.max(visible.top, frontY - GLOW);
        Object.assign(glow.style, {
          transform: `translate3d(${visible.left}px, ${top}px, 0)`,
          width: `${visible.width}px`,
          height: `${Math.max(0, frontY - top)}px`,
          opacity: String(1 - e * e),
        });
      });
    } finally {
      glow.remove();
    }
  },
};
