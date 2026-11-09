// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.

/** Where a name tag may sit: its top-left in viewport px, and whether it is left of the arrow. */
export interface LabelSpot {
  x: number;
  y: number;
  flip: boolean;
}

/** The tag's size at scale 1: 600 11px/16px text with 8px side padding, 20px tall (swarm-build.js:196). */
export const LABEL_HEIGHT = 20;
/** Width of a tag at scale 1, measured without the DOM: 6.5px per character plus the padding. */
export const labelWidth = (text: string, scale = 1) => (16 + text.length * 6.5) * scale;

/**
 * The places a cursor's tag may sit, best first, for a cursor at (x, y): below right of the arrow
 * (left of it near the right edge, so it is never cut off), then the other side, then above on
 * either side. Only the spots that fit in the viewport are offered, unless none does (a cursor
 * offstage): a tag cut off at the edge cannot be read. All sizes grow with `scale`.
 */
export function labelSpots(
  x: number,
  y: number,
  width: number,
  scale: number,
  viewportWidth: number,
  viewportHeight = Infinity,
): LabelSpot[] {
  const right = { x: x + 14 * scale, flip: false };
  const left = { x: x - width - 2 * scale, flip: true };
  const sides = x > viewportWidth - width - 24 * scale ? [left, right] : [right, left];
  const below = y + 18 * scale;
  const above = y - (LABEL_HEIGHT + 2) * scale;
  const spots = [...sides.map((s) => ({ ...s, y: below })), ...sides.map((s) => ({ ...s, y: above }))];
  const fits = (s: LabelSpot) =>
    s.x >= 0 && s.x + width <= viewportWidth && s.y >= 0 && s.y + LABEL_HEIGHT * scale <= viewportHeight;
  const inside = spots.filter(fits);
  return inside.length ? inside : spots;
}

/** Name tags: a tag's spot changes at most once in this long (ms). */
export const LABEL_DWELL_MS = 400;
/** Name tags: a tag leaves its spot only after overlapping another this long (ms). */
export const LABEL_OVERLAP_MS = 250;
/** Name tags: time constant (ms) of the slide to a new spot and of the opacity fades. */
export const LABEL_SMOOTH_MS = 45;
export const LABEL_FADE_MS = 75;

/**
 * Keeps name tags apart (greedy, in cursor order): each tag takes its first spot that does not
 * overlap a tag placed before it (with `gap` px between them), trying its `prefer`red spot (the
 * one it had last frame) first, so tags do not hop between spots. A tag with no free spot takes
 * the one it overlaps least, but keeps its preferred spot unless that halves the overlap, and is
 * marked `crowded`, for the caller to fade. A tag with `keep` set stays on its preferred spot
 * whatever it overlaps (crowded when it does). Returns the spot index per tag.
 */
export function separateLabels(
  spots: readonly LabelSpot[][],
  width: readonly number[],
  height: number,
  gap = 2,
  prefer: readonly (number | undefined)[] = [],
  keep: readonly boolean[] = [],
): { spot: number; crowded: boolean }[] {
  const placed: { x: number; y: number; w: number }[] = [];
  /** Area of `s` (width `w`) that overlaps the tags placed so far, gaps included. */
  const covered = (s: LabelSpot, w: number) =>
    placed.reduce((sum, p) => {
      const ox = Math.min(s.x + w, p.x + p.w) + gap - Math.max(s.x, p.x);
      const oy = Math.min(s.y + height, p.y + height) + gap - Math.max(s.y, p.y);
      return sum + (ox > 0 && oy > 0 ? ox * oy : 0);
    }, 0);
  return spots.map((options, i) => {
    const area = options.map((s) => covered(s, width[i]));
    const p = prefer[i] !== undefined && prefer[i]! < options.length ? prefer[i] : undefined;
    let spot = p !== undefined && (area[p] === 0 || keep[i]) ? p : area.indexOf(0);
    if (spot < 0) {
      spot = area.indexOf(Math.min(...area));
      if (p !== undefined && area[spot] > area[p] / 2) spot = p;
    }
    placed.push({ x: options[spot].x, y: options[spot].y, w: width[i] });
    return { spot, crowded: area[spot] > 0 };
  });
}
