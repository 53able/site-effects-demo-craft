// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.

import { easeIn, easeInOut, lerp } from "./easing";
import { ABORT, createLoop, type TweenFn } from "./loop";
import { resolvePalette } from "./palette";
import { createRenderer } from "./render/factory";
import type { Scene, SceneBox } from "./render/renderer";
import { Trail } from "./render/trail";
import { RIPPLE_SECONDS } from "./render/shaders/ripple";
import { bandOf } from "./reveal/band-reveal";
import { caretAt } from "./reveal/caret-reveal";
import { agentLabel, autoAgents } from "./agents";
import {
  LABEL_DWELL_MS,
  LABEL_FADE_MS,
  LABEL_HEIGHT,
  LABEL_OVERLAP_MS,
  LABEL_SMOOTH_MS,
  labelSpots,
  labelWidth,
  separateLabels,
} from "./labels";
import { byDistance, byUrgency, inExitBand, pickTask, roleOfAgent, type Role } from "./roles";
import type { RevealKind } from "./reveal/strategy";
import type { Agent, Options, RevealHooks, SwarmBuild, SwarmDebug, SwarmMode, SwarmStats, SwarmTask, TaskRect } from "./types";

export const stopped: SwarmBuild = {
  finished: Promise.resolve(),
  finish() {},
  destroy() {},
  setSpeed() {},
};

const STAT_OF: Record<RevealKind, keyof SwarmStats> = {
  band: "bandReveals",
  css: "cssFallbacks",
};

function debugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.__SWARM_DEBUG__ === true) return true;
  return new URLSearchParams(window.location.search).has("swarmDebug");
}

/** Stats for one swarm, published as `window.__swarm` only when debugging is on. */
function createDebug(): SwarmDebug {
  const stats: SwarmStats = { bandReveals: 0, cssFallbacks: 0, skipped: 0 };
  const debug: SwarmDebug = {
    stats,
    routing: { matched: 0, stolen: 0 },
    offscreenBuilt: 0,
    agents: { count: 0, idleMs: 0, workingMs: 0 },
    startedAt: null,
    firstViewBuiltAt: null,
    doneAt: null,
    sampleOverlay: () => Promise.resolve(0),
    get mode(): SwarmMode {
      if (stats.skipped > 0) return "skipped";
      const used = (Object.keys(STAT_OF) as RevealKind[]).filter((k) => stats[STAT_OF[k]] > 0);
      return used.length > 1 ? "mixed" : (used[0] ?? "none");
    },
  };
  if (debugEnabled()) window.__swarm = debug;
  return debug;
}

/** Shows everything at once and does nothing else: for reduced motion, no input or no overlay. */
export function skip(unpend: () => void, onDone?: () => void): SwarmBuild {
  unpend();
  onDone?.();
  const debug = createDebug();
  debug.stats.skipped++;
  debug.doneAt = performance.now();
  return stopped;
}

/** `sizeTiming`: the shortest drag and reveal, as a share of the full time. */
export const SIZE_TIMING_FLOOR = 0.35;
/** `sizeTiming`: a block at least this many px square (by area) takes the full time. */
export const SIZE_TIMING_EDGE = 160;

/**
 * `sizeTiming`: the share of the full drag and reveal time a `width` × `height` block takes: the
 * square root of its area over SIZE_TIMING_EDGE, between SIZE_TIMING_FLOOR and 1.
 */
export function sizeFactor(width: number, height: number): number {
  return Math.min(1, Math.max(SIZE_TIMING_FLOOR, Math.sqrt(Math.max(0, width * height)) / SIZE_TIMING_EDGE));
}

/**
 * `sizeTiming`: the fastest a drag box may grow, in CSS px of its longer side per second of loop
 * time (at its peak, mid-drag): a large or wide block takes longer rather than rush across.
 */
export const DRAG_MAX_SPEED = 2400;
/** The peak slope of easeInOut, the drag's easing: its top speed over its mean speed. */
const DRAG_EASE_PEAK = 2;

/**
 * Seconds a `sizeTiming` drag over a `width` × `height` box takes, from the full time `seconds`:
 * shorter for small blocks (sizeFactor), never so short that it grows faster than DRAG_MAX_SPEED.
 */
export function dragSeconds(seconds: number, width: number, height: number): number {
  return Math.max(seconds * sizeFactor(width, height), (Math.max(width, height) * DRAG_EASE_PEAK) / DRAG_MAX_SPEED);
}

/** The time a cursor takes to travel to its next block (`sizeTiming`: the longest travel). */
export const TRAVEL_SECONDS = 0.7;
/** `sizeTiming`: the shortest travel, however short the hop. */
export const TRAVEL_MIN_SECONDS = 0.2;
/** `sizeTiming`: a hop at least this many px long takes the full TRAVEL_SECONDS. */
export const TRAVEL_FULL_DISTANCE = 1200;

/**
 * Seconds a `sizeTiming` cursor takes to travel `distance` px: TRAVEL_SECONDS times the square
 * root of the distance over TRAVEL_FULL_DISTANCE (short hops are quicker), never less than
 * TRAVEL_MIN_SECONDS nor more than TRAVEL_SECONDS.
 */
export function travelSeconds(distance: number): number {
  return Math.min(
    TRAVEL_SECONDS,
    Math.max(TRAVEL_MIN_SECONDS, TRAVEL_SECONDS * Math.sqrt(Math.max(0, distance) / TRAVEL_FULL_DISTANCE)),
  );
}

/** A name tag's opacity while its agent is idle or on its way to a task. */
export const IDLE_TAG_OPACITY = 0.35;

type Anchor = { x: number; y: number } | { task: SwarmTask; fx: number; fy: number };

interface Cursor {
  agent: Required<Omit<Agent, "role">>;
  /** What this agent builds first; none: it takes any task. */
  role?: Role;
  /** The name tag's text: the agent's name, short (`type-agent` shows as `type`). */
  label: string;
  labelWidth: number;
  flip: boolean;
  /** Dragging out or revealing a task: its name tag shows in full; otherwise it is dimmed. */
  working: boolean;
  /**
   * Which of its spots (labels.ts) the name tag takes and since when, since when that spot has
   * overlapped another tag (null: it does not), how opaque the tag is, and where it is drawn
   * relative to the arrow (it slides there from its last spot).
   */
  tag: { spot: number; since: number; overlapSince: number | null; opacity: number; dx: number; dy: number } | null;
  offstage: () => Anchor;
  from: Anchor;
  to: Anchor;
  p: number;
  ease: (t: number) => number;
  scale: number;
  trail: Trail;
}

interface Box {
  task: SwarmTask;
  cursor: Cursor;
  e: number;
  opacity: number;
  badge: string | null;
  badgeInside: boolean;
}

/** True when `node` sits in an element that scrolls (or clips) sideways. */
function inSideScroller(node: Element | undefined): boolean {
  for (let p = node?.parentElement; p && p !== document.body; p = p.parentElement) {
    if (p.scrollWidth > p.clientWidth + 1 && getComputedStyle(p).overflowX !== "visible") return true;
  }
  return false;
}

export interface Engine {
  prepare: () => () => void;
  observe: (wake: () => void) => () => void;
  settleAll: (tween: TweenFn) => Promise<unknown>;
  /** Removes data-swarm-pending; also used when the swarm skips. */
  unpend: () => void;
  /** Runs when finish() jumps to the end, before the running tweens settle. */
  onFinish?: () => void;
  onFrame?: () => void;
  options: Options;
}

/**
 * The shared engine: a swarm of cursors works through `tasks`. Each task is a rectangle the
 * cursor drags out, then a `reveal` tween. A task starts once it has scrolled into view and
 * its `parent` task is built.
 */
export function runSwarm(
  tasks: SwarmTask[],
  { prepare, observe, settleAll, unpend, onFinish, onFrame = () => {}, options }: Engine,
): SwarmBuild {
  const { start = "now", zIndex = 2147483000, onDone, onTaskBuilt } = options;
  // Without an overlay there is nothing to show the build with: show the result instead.
  const created = createRenderer({ zIndex });
  if (!created) return skip(unpend, onDone);
  const renderer = created;

  // Role routing: an idle agent takes a task of its own role first; another role's task only
  // when no free agent has that role (work stealing).
  const routing = options.routing ?? "role";
  const pick = options.pick ?? "order";
  const pipeline = options.pipeline === true;
  const sizeTiming = options.sizeTiming === true;
  const scale = (options.scale ?? 0) > 0 ? options.scale! : 1;
  // "auto": the cast is sized to the blocks' roles (the default when roles route the work).
  const auto =
    options.agents === "auto" || (options.agents === undefined && routing === "role" && tasks.some((t) => t.role));
  const cast = auto ? autoAgents(tasks.map((t) => t.role), options.headcount) : [];
  const explicit = options.agents === "auto" ? undefined : options.agents;
  const { agents, accent } = resolvePalette(
    { palette: options.palette, agents: cast.length ? undefined : explicit },
    document,
    cast.length ? cast : undefined,
  );
  const debug = createDebug();
  debug.sampleOverlay = (opts) => renderer.sample?.(opts) ?? Promise.resolve(0);

  let state: "idle" | "running" | "ended" = "idle";
  let resolveFinished: () => void = () => {};
  let rejectFinished: (reason: unknown) => void = () => {};
  const finished = new Promise<void>((resolve, reject) => {
    resolveFinished = resolve;
    rejectFinished = reject;
  });
  const cleanups: (() => void)[] = [];

  // Tick order: tweens settle (clip-paths), then the scene is built and drawn.
  const initialSpeed = options.speed ?? 0;
  const loop = createLoop(() => render(), initialSpeed > 0 ? initialSpeed : 1);
  const tween = loop.tween;

  cleanups.push(() => renderer.dispose());
  cleanups.push(prepare());

  // Scheduling: agents pull the first task that is in view and whose parent is built.
  const wakers = new Set<() => void>();
  const wake = () => {
    wakers.forEach((r) => r());
    wakers.clear();
  };
  cleanups.push(observe(wake));

  /** A task is being drawn from the moment it is taken until it is built. */
  const drawing = () => tasks.some((t) => t.taken && !t.built);

  /**
   * Blocks that never came into view (copies in a marquee that scrolled the other way) would keep
   * the swarm running for good. Once the page is scrolled to the end, nothing is being drawn and
   * every block left is out of view to the side, they are built at once, where nobody sees them.
   */
  const offscreenLeft = (): SwarmTask[] => {
    if (loop.done || drawing()) return [];
    const root = document.scrollingElement ?? document.documentElement;
    if (root.scrollHeight - innerHeight - scrollY > 2) return [];
    const rest = tasks.filter((t) => !t.taken);
    // Nothing left that an agent could take now (a part seen before its card counts as waiting).
    if (!rest.length || rest.some((t) => t.seen && (!t.parent || t.parent.built))) return [];
    // Out of view sideways; or out of view at all inside a horizontal scroller (a marquee whose
    // section has been scrolled past). Any other block above or below is brought in by a scroll.
    const out = (t: SwarmTask) => {
      const r = t.rect();
      if (r.left + r.width < 0 || r.left >= innerWidth) return true;
      return (r.bottom < 0 || r.top > innerHeight) && inSideScroller(t.node);
    };
    return rest.every(out) ? rest : [];
  };
  const instant: TweenFn = async (_seconds, update) => update?.(1);
  const buildOffscreen = async (rest: SwarmTask[]) => {
    rest.forEach((t) => (t.taken = true));
    const hooks: RevealHooks = {
      band() {},
      count: (kind) => debug.stats[STAT_OF[kind]]++,
      caret() {},
      overlayLost: () => renderer.lost === true,
      zIndex,
    };
    // In document order: a parent before its children.
    for (const t of rest) {
      await t.reveal(instant, hooks);
      t.built = true;
      debug.offscreenBuilt++;
      onTaskBuilt?.(t);
    }
  };

  const idle = new Set<Cursor>();
  // "fair" stealing: each role's agents keep a fair share of the free blocks of their role (as
  // many per agent as there are free blocks per cursor); only the rest may be stolen.
  const fair = options.steal === "fair";
  let share = 1;
  /** Each free task's place among the free tasks of its role, in reading order. */
  const rank = new Map<SwarmTask, number>();
  // `stealAfter`: another role's agent takes a block of a role that has agents only once the
  // block has been free (seen by an idle agent) for that many seconds of loop time; from then on
  // even a block "fair" keeps for its role, so a busy role never holds a block up for long.
  const patience = Math.max(0, options.stealAfter ?? 0);
  /** Loop time each task was first found free. */
  const freeSince = new Map<SwarmTask, number>();
  // A block claimable only early (its parent not yet built) has not started to wait.
  const waitLeft = (t: SwarmTask) =>
    !patience || !t.role || !staffed.has(t.role)
      ? 0
      : patience - (freeSince.has(t) ? loop.time - freeSince.get(t)! : 0);
  const stealable = (t: SwarmTask) =>
    patience ? waitLeft(t) <= 0 : !fair || !t.role || rank.get(t)! >= (staffed.get(t.role) ?? 0) * share;

  // The first view is every task in view when the first task is picked.
  let firstView: SwarmTask[] | null = null;
  const next = async (c: Cursor): Promise<SwarmTask | null> => {
    idle.add(c);
    const idleSince = performance.now();
    try {
      for (;;) {
        if (state === "ended") throw ABORT;
        const open = tasks.filter((t) => !t.taken && (loop.done || t.seen));
        const ready = open.filter((t) => !t.parent || t.parent.built);
        // `pipeline`: a block whose parent is taken but not yet built may be claimed too; its agent
        // travels to it and drags it out the moment the parent is built (see draw). Ready blocks
        // come first.
        const early = pipeline && !loop.done ? open.filter((t) => t.parent && !t.parent.built && t.parent.taken) : [];
        const available = early.length ? [...ready, ...early] : ready;
        for (const t of ready) if (!freeSince.has(t)) freeSince.set(t, loop.time);
        let task: SwarmTask | undefined;
        // "nearest": the closest first, blocks in view before blocks taken early (look-ahead).
        // "urgent": the blocks the scroll will take out of view first.
        const order = (list: SwarmTask[]) =>
          pick === "order" || loop.done || list.length < 2
            ? list
            : pick === "nearest"
              ? byDistance(list, rectOf, ...posOf(c), innerHeight * 0.9)
              : byUrgency(list, rectOf, ...posOf(c), innerHeight, scrollDirection);
        const ordered = early.length ? [...order(ready), ...order(early)] : order(ready);
        // "urgent": a block in the exit band goes to a free agent at once, before the agent's own
        // role's blocks elsewhere, with no `stealAfter` wait and no "fair" share (see below).
        const band =
          pick === "urgent" && routing === "role" && !loop.done
            ? ordered.filter((t) => inExitBand(rectOf(t), innerHeight, scrollDirection))
            : [];
        if (routing === "any" || loop.done) task = ordered[0];
        else {
          const free = new Set<Role>();
          for (const o of idle) if (o !== c && o.role) free.add(o.role);
          if (fair) {
            share = Math.max(1, Math.ceil(available.length / cursors.length));
            const seen = new Map<Role, number>();
            for (const t of available) {
              if (!t.role) continue;
              rank.set(t, seen.get(t.role) ?? 0);
              seen.set(t.role, rank.get(t)! + 1);
            }
          }
          // In the exit band, no wait and no fair share: a block is left only to a free agent of
          // its own role (a ready block before one claimed early).
          if (band.length) {
            const isReady = (t: SwarmTask) => !t.parent || !!t.parent.built;
            task = pickTask(band.filter(isReady), c.role, free) ?? pickTask(band, c.role, free);
          }
          task ??= pickTask(ordered, c.role, free, stealable);
        }
        if (task) {
          firstView ??= tasks.filter((t) => t.seen);
          task.taken = true;
          idle.delete(c);
          if (c.role && task.role) debug.routing[task.role === c.role ? "matched" : "stolen"]++;
          // The others look again: a task one of them left for this agent may now be theirs.
          if (available.length > 1) wake();
          return task;
        }
        if (tasks.every((t) => t.taken)) return null;
        const rest = offscreenLeft();
        if (rest.length) {
          await buildOffscreen(rest);
          wake();
          continue;
        }
        const woken = new Promise<void>((r) => wakers.add(r));
        // A block held back from stealing may be stolen once it has waited: look again then.
        const left = routing === "role" ? ready.map(waitLeft).filter((s) => s > 0) : [];
        if (!left.length) await woken;
        else {
          const timer = tween(Math.min(...left));
          timer.catch(() => {});
          await Promise.race([woken, timer]);
        }
      }
    } finally {
      idle.delete(c);
      debug.agents.idleMs += performance.now() - idleSince;
    }
  };

  // Each task's rect is read once per scene: a cursor's two anchors, its box, band and ripple
  // often share one task, and each read is a getBoundingClientRect.
  const rects = new Map<SwarmTask, TaskRect>();
  const rectOf = (task: SwarmTask) => {
    let r = rects.get(task);
    if (!r) rects.set(task, (r = task.rect()));
    return r;
  };

  /** An anchor is a point in fractions of a task's rectangle, or in viewport pixels. */
  const resolve = (a: Anchor) => {
    if (!("task" in a)) return a;
    const r = rectOf(a.task);
    return { x: r.left + a.fx * r.width, y: r.top + a.fy * r.height };
  };
  /** Where a cursor is now, in viewport pixels. */
  const posOf = (c: Cursor): [number, number] => {
    const a = resolve(c.from);
    const b = resolve(c.to);
    const t = c.ease(c.p);
    return [lerp(a.x, b.x, t), lerp(a.y, b.y, t)];
  };

  const count = Math.max(1, Math.min(agents.length, tasks.length));
  debug.agents.count = count;
  const cursors = Array.from({ length: count }, (_, a): Cursor => {
    const { name, color, text = "var(--color-pearl)" } = agents[a % agents.length];
    const agent = { name, color, text };
    const role = routing === "role" ? roleOfAgent(agents[a % agents.length]) : undefined;
    // Fan in from beyond the right half of the screen.
    const angle = ((a + 0.5) / count - 0.5) * Math.PI;
    const offstage = () => {
      const reach = Math.hypot(innerWidth, innerHeight) * 0.6;
      return { x: innerWidth / 2 + Math.cos(angle) * reach, y: innerHeight / 2 + Math.sin(angle) * reach };
    };
    const startAt = offstage();
    const label = agentLabel(name);
    const trail = new Trail();
    return {
      agent,
      role,
      label,
      labelWidth: labelWidth(label, scale),
      flip: false,
      working: false,
      tag: null,
      offstage,
      from: startAt,
      to: startAt,
      p: 1,
      ease: easeInOut,
      scale: 1,
      trail,
    };
  });

  /** How many cursors work in each role. */
  const staffed = new Map<Role, number>();
  for (const c of cursors) if (c.role) staffed.set(c.role, (staffed.get(c.role) ?? 0) + 1);

  const boxes = new Set<Box>();
  const bands = new Map<SwarmTask, { e: number; color: string }>();
  const carets = new Map<SwarmTask, Text>();
  const ripples = new Set<{ task: SwarmTask; color: string; age: number }>();
  let lastScene: number | null = null;
  const buildScene = (): Scene => {
    rects.clear();
    const time = performance.now();
    const scene: Scene = {
      time,
      accent,
      scale,
      viewport: { width: innerWidth, height: innerHeight },
      cursors: [],
      labels: [],
      boxes: [],
      trails: [],
      ripples: [],
      bands: [],
      carets: [],
    };
    const at = cursors.map((c) => {
      const [x, y] = posOf(c);
      return { x, y };
    });
    // Name tags: below right of the arrow (left of it near the right edge, so it is never cut
    // off); a tag that would cover an earlier cursor's moves to a free side, or fades. A tag keeps
    // its spot for LABEL_DWELL_MS at least, and leaves it only once it has overlapped another for
    // LABEL_OVERLAP_MS; it then slides to the new spot, so tags never hop between spots.
    const spots = cursors.map((c, i) => labelSpots(at[i].x, at[i].y, c.labelWidth, scale, innerWidth, innerHeight));
    const height = LABEL_HEIGHT * scale;
    // Label timing runs on loop time, so a faster swarm settles its tags as much faster.
    const now = loop.time * 1000;
    const keep = cursors.map(
      ({ tag }) =>
        !!tag && (now - tag.since < LABEL_DWELL_MS || tag.overlapSince === null || now - tag.overlapSince < LABEL_OVERLAP_MS),
    );
    // Working agents' tags are placed first: an idle tag gives way to them.
    const order = cursors.map((_, i) => i).sort((a, b) => Number(cursors[b].working) - Number(cursors[a].working));
    const placed = separateLabels(
      order.map((i) => spots[i]),
      order.map((i) => cursors[i].labelWidth),
      height,
      2 * scale,
      order.map((i) => cursors[i].tag?.spot),
      order.map((i) => keep[i]),
    );
    const chosen = new Array<(typeof placed)[number]>(cursors.length);
    order.forEach((i, k) => (chosen[i] = placed[k]));
    const dt = lastScene === null ? 0 : Math.max(0, now - lastScene);
    lastScene = now;
    const slide = 1 - Math.exp(-dt / LABEL_SMOOTH_MS);
    const fade = 1 - Math.exp(-dt / LABEL_FADE_MS);
    cursors.forEach((c, i) => {
      const { x, y } = at[i];
      const { spot: index, crowded } = chosen[i];
      const spot = spots[i][index];
      // Full while dragging or revealing; dimmed while idle or on its way; faint when crowded.
      const target = crowded ? 0.3 : c.working ? 1 : IDLE_TAG_OPACITY;
      // First appearance: in place at once.
      const tag = (c.tag ??= { spot: index, since: now, overlapSince: null, opacity: target, dx: spot.x - x, dy: spot.y - y });
      if (tag.spot !== index) {
        tag.spot = index;
        tag.since = now;
        tag.overlapSince = null;
      }
      tag.overlapSince = crowded ? (tag.overlapSince ?? now) : null;
      tag.opacity += (target - tag.opacity) * fade;
      tag.dx += (spot.x - x - tag.dx) * slide;
      tag.dy += (spot.y - y - tag.dy) * slide;
      c.flip = spot.flip;
      const { name, color, text } = c.agent;
      c.trail.push(x, y);
      scene.trails.push({ name, color, points: c.trail.points() });
      scene.cursors.push({ name, color, text, x, y, scale: c.scale * scale, flip: c.flip });
      scene.labels.push({
        name: c.label,
        color,
        text,
        x: x + tag.dx,
        y: y + tag.dy,
        width: c.labelWidth,
        height,
        flip: c.flip,
        opacity: tag.opacity,
      });
    });
    for (const b of boxes) {
      const r = rectOf(b.task);
      const box: SceneBox = {
        x: r.left,
        y: r.top,
        width: b.e * r.width,
        height: b.e * r.height,
        color: b.cursor.agent.color,
        text: b.cursor.agent.text,
        radius: b.task.radius ?? "0",
        opacity: b.opacity,
        badge: b.badge,
        badgeInside: b.badgeInside,
      };
      scene.boxes.push(box);
    }
    for (const [task, { e, color }] of bands) scene.bands.push(bandOf(rectOf(task), e, color));
    for (const [task, typed] of carets) scene.carets.push({ ...caretAt(typed, task.node!), color: accent });
    for (const { task, color, age } of ripples) {
      const r = rectOf(task);
      const radius = parseFloat(task.radius ?? "") || 0;
      scene.ripples.push({ x: r.left, y: r.top, width: r.width, height: r.height, radius, color, age });
    }
    return scene;
  };
  // "urgent": the page's last scroll direction (1 down, -1 up, 0 before any scroll).
  let scrollDirection = 0;
  let lastScrollY = scrollY;
  const render = () => {
    if (scrollY !== lastScrollY) {
      scrollDirection = Math.sign(scrollY - lastScrollY);
      lastScrollY = scrollY;
    }
    onFrame();
    renderer.frame(buildScene());
  };

  const move = (c: Cursor, to: Anchor, seconds: number, ease = easeInOut, update: (t: number) => void = () => {}) => {
    c.from = c.to;
    c.to = to;
    c.ease = ease;
    c.p = 0;
    return tween(seconds, (t) => {
      c.p = t;
      update(t);
    });
  };

  // `pipeline`: reveals running after their agent has left. A failed one ends the run at once.
  const reveals: Promise<void>[] = [];
  let fail: (error: unknown) => void = () => {};
  const failed = new Promise<never>((_, reject) => (fail = reject));
  failed.catch(() => {});

  async function draw(c: Cursor, task: SwarmTask) {
    const box: Box = { task, cursor: c, e: 0, opacity: 1, badge: null, badgeInside: false };
    const corner: Anchor = { task, fx: 0, fy: 0 };
    const [x, y] = posOf(c);
    const to = resolve(corner);
    // `sizeTiming`: a short hop is quicker.
    await move(c, corner, sizeTiming ? travelSeconds(Math.hypot(to.x - x, to.y - y)) : TRAVEL_SECONDS);
    // Claimed early (`pipeline`): wait on its corner until its parent is built, never drawing first.
    if (task.parent && !task.parent.built) {
      const waitingSince = performance.now();
      try {
        while (!task.parent.built) {
          if (state === "ended") throw ABORT;
          await new Promise<void>((r) => wakers.add(r));
        }
      } finally {
        debug.agents.idleMs += performance.now() - waitingSince;
      }
    }
    // Its name tag shows in full only while it drags and reveals.
    c.working = true;
    const workingSince = performance.now();
    c.scale = 0.85;
    boxes.add(box);
    render();
    const { width, height } = task.size();
    // Below the box, or inside its bottom edge when the box reaches the screen's bottom.
    const rect = task.rect();
    box.badgeInside = rect.bottom > innerHeight - 24 * scale;
    const area = Math.min(1, (rect.width * rect.height) / (innerWidth * innerHeight));
    // `sizeTiming`: a small block drags out and reveals in a share of the time; a large one drags
    // no faster than DRAG_MAX_SPEED.
    const f = sizeTiming ? sizeFactor(rect.width, rect.height) : 1;
    const full = 0.4 + area * 0.6;
    const seconds = sizeTiming ? dragSeconds(full, rect.width, rect.height) : full;
    await move(c, { task, fx: 1, fy: 1 }, seconds, easeInOut, (t) => {
      box.e = easeInOut(t);
      const w = Math.round(box.e * width);
      const h = Math.round(box.e * height);
      // No "0 × 0" tag while the drag is just starting.
      box.badge = w && h ? `${w} × ${h}` : null;
    });
    c.scale = 1;
    const timed: TweenFn = f === 1 ? tween : (seconds, update) => tween(seconds * f, update);
    const stop = () => {
      c.working = false;
      debug.agents.workingMs += performance.now() - workingSince;
    };
    if (!pipeline) return reveal(c, task, box, timed, stop);
    // `pipeline`: the agent leaves now; the reveal and ripple finish on their own.
    stop();
    const revealing = reveal(c, task, box, timed, () => {});
    revealing.catch(fail);
    reveals.push(revealing);
  }

  /** Reveals a dragged-out task, marks it built, and plays its ripple; `stop` ends the agent's work. */
  async function reveal(c: Cursor, task: SwarmTask, box: Box, timed: TweenFn, stop: () => void) {
    try {
      await task.reveal(timed, {
        band: (e) => (e === null ? bands.delete(task) : bands.set(task, { e, color: c.agent.color })),
        count: (kind) => debug.stats[STAT_OF[kind]]++,
        caret: (typed) => (typed && task.node ? carets.set(task, typed) : carets.delete(task)),
        overlayLost: () => renderer.lost === true,
        zIndex,
      });
    } finally {
      bands.delete(task);
      carets.delete(task);
      stop();
    }
    task.built = true;
    wake();
    // A gold ring leaves the block's outline as it completes.
    const ripple = { task, color: c.agent.color, age: 0 };
    ripples.add(ripple);
    tween(RIPPLE_SECONDS, (t) => (ripple.age = t * RIPPLE_SECONDS))
      .catch(() => {})
      .finally(() => ripples.delete(ripple));
    onTaskBuilt?.(task);
    if (firstView && debug.firstViewBuiltAt === null && firstView.every((t) => t.built)) {
      debug.firstViewBuiltAt = performance.now();
    }
    tween(0.25, (t) => (box.opacity = 1 - t))
      .catch(() => {})
      .finally(() => boxes.delete(box));
  }

  async function run() {
    debug.startedAt = performance.now();
    loop.start();
    const agentsDone = Promise.all(
      cursors.map(async (c, a) => {
        await tween(a * 0.2);
        for (let task = await next(c); task; task = await next(c)) await draw(c, task);
      }),
    );
    await Promise.race([agentsDone, failed]);
    const exits = cursors.map((c) => tween(0.2).then(() => move(c, c.offstage(), 0.9, easeIn)));
    const exited = Promise.all(exits);
    // Observe exits immediately: failed reveals can cancel their tweens before the final await.
    void exited.catch(() => {});
    // `pipeline`: the last reveals finish as the cursors leave.
    await Promise.race([Promise.all(reveals), failed]);
    await settleAll(tween);
    await exited;
  }

  /** Removes everything the swarm added; `completed` decides whether onDone runs. */
  const end = (completed: boolean, failure?: { reason: unknown }) => {
    if (state === "ended") return;
    state = "ended";
    loop.stop();
    wake();
    for (const cleanup of cleanups.splice(0).reverse()) {
      try { cleanup(); } catch (reason) { failure ??= { reason }; }
    }
    debug.doneAt = performance.now();
    if (!failure && completed) {
      try { onDone?.(); } catch (reason) { failure = { reason }; }
    }
    if (failure) rejectFinished(failure.reason);
    else resolveFinished();
  };

  const begin = () => {
    if (state !== "idle") return;
    state = "running";
    run().then(
      () => end(true),
      (error) => {
        end(false, error === ABORT ? undefined : { reason: error });
      },
    );
  };

  // Place the cursors offstage now, so they never flash at the top-left before the first tick.
  render();

  if (start === "now") begin();
  else {
    // Start once the first task scrolls into view.
    const waitForView = async () => {
      while (state === "idle" && !tasks.some((t) => t.seen)) await new Promise<void>((r) => wakers.add(r));
      begin();
    };
    waitForView();
  }

  return {
    finished,
    /** Jumps to the finished result and removes the swarm; onDone runs. */
    finish() {
      if (state === "idle") return end(true);
      if (state !== "running") return;
      loop.markDone();
      onFinish?.();
      wake();
      loop.settleActive();
    },
    /** Removes everything now, wherever the build is; onDone does not run. */
    destroy() {
      end(false);
    },
    /** Changes the speed while it runs: 2 is twice as fast. */
    setSpeed(value: number) {
      if (value > 0) loop.setSpeed(value);
    },
  };
}
