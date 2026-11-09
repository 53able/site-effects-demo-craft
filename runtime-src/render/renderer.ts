// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.

export interface SceneCursor {
  name: string;
  color: string;
  /** Label text colour. */
  text: string;
  x: number;
  y: number;
  scale: number;
  /** True near the right edge: the label sits left of the arrow. */
  flip: boolean;
}

export interface SceneLabel {
  name: string;
  color: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  flip: boolean;
  /** 0..1; a tag that would cover an earlier one and has nowhere free to go fades. Default 1. */
  opacity?: number;
}

export interface SceneBox {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  text: string;
  radius: string;
  opacity: number;
  /** "W × H", or null while either side rounds to 0. */
  badge: string | null;
  /** True when the box reaches the screen's bottom: the badge sits inside its bottom edge. */
  badgeInside: boolean;
}

export interface SceneTrail {
  name: string;
  color: string;
  points: { x: number; y: number }[];
}

export interface SceneRipple {
  x: number;
  y: number;
  width: number;
  height: number;
  /** The block's corner radius in px. */
  radius: number;
  color: string;
  /** Seconds since the task was built. */
  age: number;
}

export interface SceneBand {
  /** The visible rect from sweepFront(), overhang included. */
  left: number;
  top: number;
  width: number;
  height: number;
  frontY: number;
  e: number;
  color: string;
}

export interface SceneCaret {
  x: number;
  y: number;
  height: number;
  color: string;
}

/** Everything the overlay draws in one frame, as plain data in viewport pixels. */
export interface Scene {
  time: number;
  viewport: { width: number; height: number };
  /**
   * The `scale` option: name tags, badges, trails and drag-box lines are drawn this much larger
   * (cursors carry it in their own `scale`). Default 1.
   */
  scale?: number;
  cursors: SceneCursor[];
  labels: SceneLabel[];
  boxes: SceneBox[];
  trails: SceneTrail[];
  ripples: SceneRipple[];
  bands: SceneBand[];
  carets: SceneCaret[];
  /** The accent colour: band edge, ripples and caret. Default: the theme's gold. */
  accent?: string;

}

/** Which pixels `sample()` counts: the whole overlay, or squares around the caret or the cursors. */
export interface SampleOptions {
  around?: "caret" | "cursors";
  /** Half the side of each square, in CSS px. Default 24. */
  radius?: number;
}

export interface Renderer {
  frame(scene: Scene): void;
  dispose(): void;
  /** True once the overlay can no longer draw (its WebGL context was lost). */
  readonly lost?: boolean;
  /**
   * Counts non-transparent overlay pixels, read in the same frame right after drawing. Resolves 0
   * once disposed or lost, or when `around` finds nothing to sample within a couple of seconds.
   */
  sample?(opts?: SampleOptions): Promise<number>;
}

export interface RendererOptions {
  zIndex: number;
}
