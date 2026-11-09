// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.
/** The most points a cursor's trail keeps. */
export const TRAIL_POINTS = 24;
/** How long a drawn trail may be, in CSS px: a comet tail, never a streak across the page. */
export const TRAIL_REACH = 120;
/** A move longer than this in one frame, in CSS px, is a jump: the trail starts over. */
export const TRAIL_JUMP = 200;

type Point = { x: number; y: number };

/** A ring buffer of a cursor's last positions, oldest first. */
export class Trail {
  private readonly xs = new Float32Array(TRAIL_POINTS);
  private readonly ys = new Float32Array(TRAIL_POINTS);
  private head = 0;
  private size = 0;

  push(x: number, y: number): void {
    if (this.size) {
      const last = (this.head - 1 + TRAIL_POINTS) % TRAIL_POINTS;
      if (Math.hypot(x - this.xs[last], y - this.ys[last]) > TRAIL_JUMP) this.size = 0;
    }
    this.xs[this.head] = x;
    this.ys[this.head] = y;
    this.head = (this.head + 1) % TRAIL_POINTS;
    this.size = Math.min(this.size + 1, TRAIL_POINTS);
  }

  get length(): number {
    return this.size;
  }

  /** A copy of the points, oldest first. */
  points(): Point[] {
    const out: Point[] = [];
    const start = (this.head - this.size + TRAIL_POINTS) % TRAIL_POINTS;
    for (let i = 0; i < this.size; i++) {
      const k = (start + i) % TRAIL_POINTS;
      out.push({ x: this.xs[k], y: this.ys[k] });
    }
    return out;
  }
}

/** The newest points of a trail, oldest first, at most TRAIL_REACH px long along the path. */
export function trimTrail(points: Point[]): Point[] {
  if (!points.length) return [];
  const out = [points[points.length - 1]];
  let length = 0;
  for (let i = points.length - 2; i >= 0 && out.length < TRAIL_POINTS; i--) {
    const a = points[i];
    const b = out[0];
    const step = Math.hypot(b.x - a.x, b.y - a.y);
    if (length + step > TRAIL_REACH) {
      const k = (TRAIL_REACH - length) / step;
      if (k > 0) out.unshift({ x: b.x + (a.x - b.x) * k, y: b.y + (a.y - b.y) * k });
      break;
    }
    length += step;
    out.unshift(a);
  }
  return out;
}
