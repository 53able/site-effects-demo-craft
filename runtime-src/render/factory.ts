// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.

import type { Renderer, RendererOptions } from "./renderer";
import { WebGLOverlay } from "./webgl-overlay";

/** Returns null when the overlay cannot run (for example without WebGL2): the swarm then skips. */
export type RendererFactory = (opts: RendererOptions) => Renderer | null;

/**
 * The WebGL2 overlay, or null without WebGL2 or when its shaders fail to build. Null makes the
 * swarm show the finished page at once (plan §3.1 principle 3); a context lost later switches
 * the remaining blocks to the CSS fallback instead.
 */
export const defaultRendererFactory: RendererFactory = (opts) => {
  try {
    return WebGLOverlay.create(opts);
  } catch (error) {
    console.warn(error);
    return null;
  }
};

let factory: RendererFactory = defaultRendererFactory;

/** Swaps the factory every later swarm uses; null restores the default. */
export function setRendererFactory(next: RendererFactory | null): void {
  factory = next ?? defaultRendererFactory;
}

export function createRenderer(opts: RendererOptions): Renderer | null {
  return factory(opts);
}
