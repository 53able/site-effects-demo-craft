// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.

/** Where a typing block's caret sits, in viewport px. */
export interface CaretPlace {
  x: number;
  y: number;
  height: number;
}

/**
 * The caret after the text typed so far: the right edge of the last client rect of `typed`.
 * Before the first character (or where ranges have no rects) it sits at the block's top-left,
 * one line tall.
 */
export function caretAt(typed: Text, block: Element): CaretPlace {
  if (typed.length > 0) {
    const range = document.createRange();
    range.setStart(typed, 0);
    range.setEnd(typed, typed.length);
    const rects = typeof range.getClientRects === "function" ? range.getClientRects() : null;
    const last = rects && rects.length ? rects[rects.length - 1] : null;
    range.detach();
    if (last) return { x: last.right, y: last.top, height: last.height };
  }
  const box = block.getBoundingClientRect();
  const style = getComputedStyle(block);
  const line = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) || 16) * 1.2;
  return { x: box.left, y: box.top, height: line };
}
