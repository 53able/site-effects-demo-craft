// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.

import type { Region } from "./types";

/** A rectangle in viewport pixels. */
export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Hides an element. */
export const HIDDEN = "inset(0 0 100% 0)";

/** How far the sweep reaches past the block's top, left and right edges, in px. */
export const OVERHANG = 40;

export const inset = ({ x, y, w, h }: Region, hPct = h): string =>
  `inset(${y}% ${100 - x - w}% ${100 - y - hPct}% ${x}%)`;

export interface SweepFront {
  /** The inset() terms: px on top/right/left; the bottom is `calc(bottomPct% - bottomPx px)`. */
  inset: { top: number; right: number; left: number; bottomPct: number; bottomPx: number };
  /** The visible part of `rect`, overhang included, in the same coordinates as `rect`. */
  visible: { left: number; top: number; right: number; bottom: number; width: number; height: number };
  /** The y of the sweep's leading (bottom) edge. */
  frontY: number;
}

/**
 * The single source of the sweep geometry at progress `e` (0..1) for a block at `rect`.
 * The sweep reaches 40px past the top, left and right edges so most shadows show as it builds;
 * its bottom edge moves from the block's top down to 40px below its bottom.
 */
export function sweepFront(rect: RectLike, e: number): SweepFront {
  const terms = { top: -OVERHANG, right: -OVERHANG, left: -OVERHANG, bottomPct: (1 - e) * 100, bottomPx: e * OVERHANG };
  const frontY = rect.top + rect.height - ((terms.bottomPct / 100) * rect.height - terms.bottomPx);
  const left = rect.left + terms.left;
  const right = rect.left + rect.width - terms.right;
  const top = rect.top + terms.top;
  const bottom = Math.max(top, frontY);
  return {
    inset: terms,
    visible: { left, top, right, bottom, width: right - left, height: bottom - top },
    frontY,
  };
}

const ORIGIN: RectLike = { left: 0, top: 0, width: 0, height: 0 };

/** The clip-path for progress `e`, built from the same terms as {@link sweepFront}. */
export const sweep = (e: number): string => {
  const { top, right, left, bottomPct, bottomPx } = sweepFront(ORIGIN, e).inset;
  return `inset(${top}px ${right}px calc(${bottomPct}% - ${bottomPx}px) ${left}px)`;
};
