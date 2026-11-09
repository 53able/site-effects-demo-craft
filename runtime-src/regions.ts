// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.

import type { Region } from "./types";

/** A header, a sidebar, a main block and two cards: a fallback for when no regions are given. */
export function autoRegions(): Region[] {
  return [
    { x: 0, y: 0, w: 100, h: 12 },
    { x: 0, y: 12, w: 28, h: 88 },
    { x: 28, y: 12, w: 72, h: 42 },
    { x: 28, y: 54, w: 36, h: 46 },
    { x: 64, y: 54, w: 36, h: 46 },
  ];
}

/** Parses "x y w h, x y w h" (percent of the image) into regions. */
export function parseRegions(text: string): Region[] {
  return text
    .split(/[,;]/)
    .map((part) => part.trim().split(/\s+/).map(Number))
    .filter((n) => n.length === 4 && n.every(Number.isFinite))
    .map(([x, y, w, h]) => ({ x, y, w, h }));
}
