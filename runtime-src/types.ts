// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.

import type { RectLike } from "./clip";
import type { TweenFn } from "./loop";
import type { SampleOptions } from "./render/renderer";
import type { RevealKind, RevealStrategy } from "./reveal/strategy";
import type { Role } from "./roles";

/** Part of an image, in percent of its width and height. */
export type Region = { x: number; y: number; w: number; h: number };

/**
 * `text` is the label text colour. `role` is what the agent builds first (default: the role in
 * its name, as in `image-agent`); an agent with no role takes any block.
 */
export type Agent = { name: string; color: string; text?: string; role?: Role };

/**
 * The effects' colours; any CSS colour string. `agents` recolours the cursors in order (label
 * pills, trails, drag boxes), cycling when shorter; `accent` tints the reveal band's edge,
 * ripples and the typing caret (default: the first agent colour). Omit the
 * palette to read the colours from the page (extractPalette()).
 */
export type Palette = { agents?: string[]; accent?: string };

export type Target =
  | Element
  | {
      el: Element;
      /** Built in order. Defaults to `data-swarm-regions`, then a generic app layout. */
      regions?: Region[];
      /** Image URL. Defaults to the img's current source or the element's background image. */
      src?: string;
    };

export type Options = {
  /**
   * Cursors, one per agent (up to the number of blocks). "auto" (the default when `routing` is
   * "role" and the blocks have roles, as page blocks do): twelve agents split over the roles in
   * proportion to how many blocks each has, named `type-1` … `type-4`, `layout` (see autoAgents).
   * Without roles the default is the six DEFAULT_AGENTS.
   */
  agents?: Agent[] | "auto";
  /**
   * Size of the cursors, name tags, drag-box badges, trails and drag-box lines: 1.8 draws them
   * 1.8 times as large, so their metal reads in a video. The text is drawn at this scale times
   * the device pixel ratio. Default 1.
   */
  scale?: number;
  /** How many agents `agents: "auto"` runs (never more than there are blocks). Default 12. */
  headcount?: number;
  /** Colours of the effects. Without it, they are read from the page. */
  palette?: Palette;
  /** 2 plays twice as fast. Default 1. */
  speed?: number;
  /** "visible" waits until a target scrolls into view; "now" starts at once. */
  start?: "visible" | "now";
  /** Blank canvas color shown before a region is built. */
  canvas?: string;
  /** z-index of the fixed overlay. */
  zIndex?: number;
  /**
   * "role" (default): an idle agent takes a block of its own role first, and another role's only
   * when no agent of that role is free. "any": every agent takes the next block in reading order.
   */
  routing?: "role" | "any";
  /**
   * With role routing, when an agent may build another role's block. "eager" (default): whenever
   * no agent of that role is free. "fair": each role's agents keep a fair share of the free blocks
   * of their role (as many per agent as there are free blocks per cursor) and only the rest is
   * stolen, so more blocks go to their own role at some cost in build time. A role with no agent
   * is always stolen.
   */
  steal?: "eager" | "fair";
  /**
   * With role routing, how long (seconds) a free block waits for an agent of its own role before
   * another role's agent may take it. When set, it replaces `steal`'s rule: once a block has
   * waited, it may be stolen even if "fair" would keep it for its role (a role whose agents are
   * all busy never holds a block up for long). A role with no agent is never waited for. Raises
   * the share of blocks built by their own role at some cost in build time. Default 0.
   */
  stealAfter?: number;
  /**
   * Look-ahead, in viewport heights: blocks whose top is within this margin below the viewport
   * become eligible before they scroll into view (a child still waits for its parent, and the
   * rules for the end of the page still apply). 0.5 starts blocks up to half a screen below.
   * Default 0: a block waits until it is in view.
   */
  lookahead?: number;
  /** Viewport fraction eligible before scrolling: 0.9 normally, 1 for full-view demo completion. */
  viewportRatio?: number;
  /**
   * Which eligible block an idle agent takes; its own role always first. "order" (default): the
   * first in reading order. "nearest": the closest to its cursor (from the block's top-left);
   * blocks in view come before blocks below it (look-ahead), and lower blocks weigh more, so a
   * block far down never jumps ahead of the ones on screen. "urgent": the block the scroll will
   * take out of view first (scrolling down, or before any scroll: the one nearest the top edge;
   * scrolling up: nearest the bottom edge), the closest to its cursor among blocks within a tenth
   * of the viewport height of each other. With role routing, a block in the exit band (the quarter
   * of the viewport at the edge the scroll leaves by; the top before any scroll) goes to a free
   * agent at once, ahead of its own role's blocks elsewhere and with no `stealAfter` wait or
   * "fair" share; it is left only to a free agent of its own role.
   */
  pick?: "order" | "nearest" | "urgent";
  /**
   * true: once its cursor has dragged out a box, the agent leaves for its next block while the
   * reveal and ripple finish on their own. A child block whose parent is taken but not yet built
   * may be claimed too: its agent travels to it and starts the drag the moment the parent is
   * built (never before; the same for deeper levels). Default false: the agent stays until the
   * reveal is done.
   */
  pipeline?: boolean;
  /**
   * true: the drag and the reveal take less time for small blocks (links, tags, dates), in
   * proportion to the square root of their area, never less than SIZE_TIMING_FLOOR of the full
   * time; a large or wide block's drag is slowed so the box never grows faster than DRAG_MAX_SPEED.
   * The travel to a block takes less time for a short hop (travelSeconds: from TRAVEL_MIN_SECONDS
   * up to TRAVEL_SECONDS). Default false: every block takes the same drag, reveal and travel time.
   */
  sizeTiming?: boolean;
  onDone?: () => void;
  /** Internal: runs each time a task is built (ripples, e2e timing). */
  onTaskBuilt?: (task: SwarmTask) => void;
};

/** Same as Options, but `start` defaults to "now". */
export type PageOptions = Omit<Options, "canvas"> & {
  /** 2 types plain-text blocks twice as fast, on top of `speed`. Default 1. */
  typeSpeed?: number;
  /** Internal: how non-typing blocks appear. Default: the clip sweep. */
  reveal?: RevealStrategy;
};

export type SwarmBuild = {
  /** Resolves after completion/cancellation and cleanup; rejects on genuine runtime failures. */
  finished: Promise<void>;
  /** Jump to the finished result. */
  finish(): void;
  /** Remove everything now (for example on unmount). */
  destroy(): void;
  /** Change the speed while it runs: 2 is twice as fast. */
  setSpeed(speed: number): void;
};

/** A rectangle the swarm builds, as reported by its task. */
export interface TaskRect extends RectLike {
  bottom: number;
}

/** Lets a reveal tell the engine what it is doing, for the scene and the stats. */
export interface RevealHooks {
  /** The sweep progress of this task's band, or null once it has none. */
  band(e: number | null): void;
  /** Counts one reveal of this kind. */
  count(kind: RevealKind): void;
  /** The text node being typed, so the scene can place the caret after it; null once typed. */
  caret(typed: Text | null): void;
  /** True once the overlay can no longer draw: later reveals use the CSS fallback. */
  overlayLost(): boolean;
  /** The overlay's z-index. */
  zIndex: number;
}

/** One unit of work: a cursor drags out `rect()`, then `reveal` runs. */
export interface SwarmTask {
  seen: boolean;
  taken?: boolean;
  built?: boolean;
  parent?: SwarmTask;
  radius?: string;
  /** The element this task builds, when it builds a page block. */
  node?: Element;
  /** Which agent role builds it first (page blocks; see roles.ts). */
  role?: Role;
  rect(): TaskRect;
  size(): { width: number; height: number };
  reveal(tween: TweenFn, hooks: RevealHooks): Promise<void>;
}

export type SwarmMode = "band" | "css" | "mixed" | "skipped" | "none";

export interface SwarmStats {
  bandReveals: number;
  cssFallbacks: number;
  skipped: number;
}

/** Exposed as `window.__swarm` only with `?swarmDebug` or `window.__SWARM_DEBUG__ === true`. */
export interface SwarmDebug {
  stats: SwarmStats;
  /** performance.now() when the run began, or null before it begins. */
  startedAt: number | null;
  /** performance.now() when every task in view at the first pick was built. */
  firstViewBuiltAt: number | null;
  /** performance.now() when the swarm ended. */
  doneAt: number | null;
  readonly mode: SwarmMode;
  /** Tasks taken by an agent of their own role, and by an agent of another role (stolen). */
  routing: { matched: number; stolen: number };
  /** Blocks built at once, unseen, at the end (they never came into view, e.g. marquee copies). */
  offscreenBuilt: number;
  /**
   * Cursors, and their summed time (performance.now ms) waiting for a task (idle) and dragging
   * out or revealing one (working; with `pipeline`, dragging only); the rest is travel.
   */
  agents: { count: number; idleMs: number; workingMs: number };
  /**
   * Counts non-transparent overlay pixels, read in the frame right after it is drawn: the whole
   * overlay, or squares around the typing caret or the cursors. Resolves 0 without an overlay.
   */
  sampleOverlay(opts?: SampleOptions): Promise<number>;
}

declare global {
  interface Window {
    __swarm?: SwarmDebug;
    __SWARM_DEBUG__?: boolean;
  }
}
