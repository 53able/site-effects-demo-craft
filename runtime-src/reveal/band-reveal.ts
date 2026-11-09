// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.

import { sweep, sweepFront, type RectLike } from "../clip";
import { easeOut } from "../easing";
import type { SceneBand } from "../render/renderer";
import type { RevealStrategy } from "./strategy";

/** Seconds a sweep takes (swarm-build.js:612). */
export const SWEEP_SECONDS = 0.45;

/**
 * The block's clip-path opens top to bottom over 0.45s, and each step reports `e` so
 * the overlay draws the band at the same front on the same frame.
 */
export const bandReveal: RevealStrategy = {
  kind: "band",
  async reveal({ node, tween, progress }) {
    await tween(SWEEP_SECONDS, (t) => {
      const e = easeOut(t);
      node.style.clipPath = sweep(e);
      progress(e);
    });
  },
};

/** The band the overlay draws for a block at `rect`, from the same geometry as its clip-path. */
export function bandOf(rect: RectLike, e: number, color: string): SceneBand {
  const { visible, frontY } = sweepFront(rect, e);
  return { left: visible.left, top: visible.top, width: visible.width, height: visible.height, frontY, e, color };
}
