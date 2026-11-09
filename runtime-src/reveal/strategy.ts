// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.

import type { TweenFn } from "../loop";

/** Which 2D path showed a block: the overlay band or CSS fallback. */
export type RevealKind = "band" | "css";

export interface RevealContext {
  node: HTMLElement;
  tween: TweenFn;
  /** Reports the sweep progress so the scene can place the band on the same frame. */
  progress(e: number): void;
  /** The overlay's z-index; the CSS fallback's glow sits at the same level. */
  zIndex: number;
}

/** How a non-typing block appears. The block's clip-path stays the source of truth. */
export interface RevealStrategy {
  readonly kind: RevealKind;
  reveal(ctx: RevealContext): Promise<void>;
}

/** Chooses typing, an overlay sweep, or a CSS fallback for transformed/lost overlays. */
export type RevealPath = "band" | "caret" | "css";

export function chooseReveal({ typing, transformed, overlayLost }: {
  typing: boolean;
  transformed: () => boolean;
  overlayLost: boolean;
}): RevealPath {
  if (typing) return "caret";
  if (overlayLost || transformed()) return "css";
  return "band";
}

/** True when `node` or an ancestor has a CSS transform. */
export function hasTransform(node: Element): boolean {
  for (let n: Element | null = node; n; n = n.parentElement) {
    const t = getComputedStyle(n).transform;
    if (t && t !== "none") return true;
  }
  return false;
}
