// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.

/** What an agent builds. Each default agent is named after its role: `type-agent` and so on. */
export const ROLES = [
  "layout",
  "type",
  "grid",
  "color",
  "icon",
  "motion",
  "image",
  "copy",
  "link",
  "form",
  "chart",
  "review",
] as const;

export type Role = (typeof ROLES)[number];

const isRole = (value: string | null | undefined): value is Role => !!value && (ROLES as readonly string[]).includes(value);

/**
 * The role an agent works in: its own `role`, else one in its name (`image-agent`, `image-2`,
 * `image`), else none.
 */
export function roleOfAgent(agent: { name: string; role?: Role }): Role | undefined {
  if (agent.role) return agent.role;
  const match = /^([a-z]+)(?:-agent|-\d+)?$/.exec(agent.name);
  return match && isRole(match[1]) ? match[1] : undefined;
}

/** What classifyRole looks at, read from a block once (see blockFeatures). */
export interface BlockFeatures {
  /** Lower-case tag name. */
  tag: string;
  /** `data-swarm-role`, when set. */
  override?: string | null;
  /** The block types itself in (plain text). */
  typing: boolean;
  /** The block is a heading, or sits in one. */
  heading: boolean;
  /** The block is an svg, holds nothing but one, or is named as an icon (class "icon"). */
  svg: boolean;
  /** A picture marked decorative (alt="", aria-hidden, role=presentation). */
  decorative?: boolean;
  /** No children and no text, only a background colour (a rule, a guide line, a swatch). */
  swatch?: boolean;
  /** The block shows a picture: an img/picture/video, or a background-image url(). */
  picture: boolean;
  /** A background-image gradient with no text of its own (decoration). */
  gradient: boolean;
  /** A CSS animation runs on it (decoration that moves). */
  animated: boolean;
  /** A link, or holds nothing but one. */
  link: boolean;
  /** A form control or form, or holds nothing but one. */
  form: boolean;
  /** A table, canvas, meter or progress, or `[data-chart]` (or holds nothing but one). */
  chart: boolean;
  /** Laid out as a grid, or a card (article, or a class with "card"). */
  grid: boolean;
  /** Has element children (a container). */
  container: boolean;
}

const CONTROLS = "button, input, select, textarea, form, label, [role=button], [role=checkbox], [role=switch]";
const CHARTS = "table, canvas, meter, progress, [data-chart]";
const LAYOUT_TAGS = new Set(["section", "header", "footer", "main", "nav", "aside", "article", "body"]);

/**
 * The role that builds a block, from its features: an explicit `data-swarm-role` first, then
 * forms, charts, pictures (decorative ones to `color`, or `motion` when they animate), icons,
 * links, text (headings to `type`, other text to `copy`), decoration (gradients and plain colour
 * boxes to `color`, animated parts to `motion`), and containers (cards and grids to `grid`,
 * sections and other boxes to `layout`). Anything else goes to `review`.
 */
export function classifyRole(f: BlockFeatures): Role {
  if (isRole(f.override)) return f.override;
  if (f.form) return "form";
  if (f.chart) return "chart";
  if (f.picture && f.decorative) return f.animated ? "motion" : "color";
  if (f.picture) return "image";
  if (f.svg) return "icon";
  if (f.link) return "link";
  if (f.typing || f.heading) return f.heading ? "type" : "copy";
  if (f.gradient || f.swatch) return "color";
  if (f.animated) return "motion";
  if (f.grid) return "grid";
  if (f.container || LAYOUT_TAGS.has(f.tag)) return "layout";
  return "review";
}

/** Reads a block's features from the DOM, once, as its task is made. */
export function blockFeatures(el: Element, typing: boolean): BlockFeatures {
  const cs = getComputedStyle(el);
  const tag = el.localName;
  const only = el.children.length === 1 && !(el.textContent ?? "").trim() ? el.children[0] : null;
  const bg = cs.backgroundImage ?? "";
  const ownText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim());
  return {
    tag,
    override: el.getAttribute("data-swarm-role"),
    typing,
    heading: !!el.closest("h1, h2, h3, h4, h5, h6, [role=heading]"),
    svg: tag === "svg" || only?.localName === "svg" || /(^|[\s_-])icon($|[\s_-])/i.test(el.getAttribute("class") ?? ""),
    decorative:
      el.getAttribute("alt") === "" ||
      el.getAttribute("aria-hidden") === "true" ||
      el.getAttribute("role") === "presentation",
    swatch:
      el.children.length === 0 &&
      !(el.textContent ?? "").trim() &&
      !/^(transparent|rgba\(.*,\s*0\))$/.test(cs.backgroundColor ?? "transparent"),
    picture:
      ["img", "picture", "video"].includes(tag) ||
      ["img", "picture", "video"].includes(only?.localName ?? "") ||
      (/url\(/.test(bg) && !ownText),
    gradient: /gradient\(/.test(bg) && !ownText,
    animated: !!cs.animationName && cs.animationName !== "none",
    link: tag === "a" || el.getAttribute("role") === "link" || only?.localName === "a",
    form: el.matches(CONTROLS) || !!only?.matches(CONTROLS),
    chart: el.matches(CHARTS) || !!only?.matches(CHARTS),
    grid: cs.display === "grid" || cs.display === "inline-grid" || tag === "article" || /card/i.test(el.getAttribute("class") ?? ""),
    container: el.children.length > 0,
  };
}

/**
 * Which task an idle agent takes from `available` (in reading order): the first of its own
 * role; else the first whose role has no other free agent to take it (work stealing), or that
 * has no role. `canSteal` may hold a task back from stealing for now (its own agents may yet
 * come for it). An agent with no role takes the first. Undefined: it waits.
 */
export function pickTask<T extends { role?: Role }>(
  available: readonly T[],
  role: Role | undefined,
  freeRoles: ReadonlySet<Role>,
  canSteal: (task: T) => boolean = () => true,
): T | undefined {
  if (!role) return available[0];
  return (
    available.find((t) => t.role === role) ??
    available.find((t) => !t.role || (!freeRoles.has(t.role) && canSteal(t)))
  );
}

/**
 * `available` reordered for `pick: "nearest"`: blocks whose top is above `line` (in view) before
 * blocks below it (taken early by look-ahead); within each, by the distance from the cursor at
 * (`x`, `y`) to the block's top-left, plus `readingWeight` times its top (viewport px), so of two
 * blocks about as far away the higher one comes first and a block far down never jumps ahead of
 * the ones above it. Ties keep reading order.
 */
export function byDistance<T>(
  available: readonly T[],
  rectOf: (task: T) => { left: number; top: number },
  x: number,
  y: number,
  line: number,
  readingWeight = 0.5,
): T[] {
  const keyed = available.map((task, i) => {
    const r = rectOf(task);
    const below = r.top > line ? 1 : 0;
    return { task, i, below, d: Math.hypot(r.left - x, r.top - y) + readingWeight * Math.max(0, r.top) };
  });
  keyed.sort((a, b) => a.below - b.below || a.d - b.d || a.i - b.i);
  return keyed.map((k) => k.task);
}

/**
 * `available` reordered for `pick: "urgent"`: the blocks about to leave the viewport first. While
 * the page scrolls down (`direction` 1), or before it has scrolled (0), by how close a block's top
 * is to the viewport's top; while it scrolls up (-1), by how close its bottom is to the viewport's
 * bottom (`viewportHeight`). Blocks within `band` (a share of the viewport height) of each other
 * count as equally urgent and go by the distance from the cursor at (`x`, `y`) to their top-left;
 * then reading order. A parent's top is above its children's (bottom below), so it comes first.
 */
export function byUrgency<T>(
  available: readonly T[],
  rectOf: (task: T) => { left: number; top: number; bottom: number },
  x: number,
  y: number,
  viewportHeight: number,
  direction: number,
  band = 0.1,
): T[] {
  const step = Math.max(1, viewportHeight * band);
  const keyed = available.map((task, i) => {
    const r = rectOf(task);
    const urgency = direction < 0 ? viewportHeight - r.bottom : r.top;
    return { task, i, bucket: Math.floor(urgency / step), d: Math.hypot(r.left - x, r.top - y) };
  });
  keyed.sort((a, b) => a.bucket - b.bucket || a.d - b.d || a.i - b.i);
  return keyed.map((k) => k.task);
}

/** `pick: "urgent"`: the share of the viewport height, at the edge the scroll leaves by, that is the exit band. */
export const EXIT_BAND = 0.25;

/**
 * `pick: "urgent"`: true when a block is in the exit band, the `share` of the viewport nearest
 * the edge the page scrolls away from: while it scrolls down (`direction` 1), or before it has
 * scrolled (0), its top is in the top band; while it scrolls up (-1), its bottom is in the bottom
 * band. Any free agent takes such a block at once, whatever its role.
 */
export function inExitBand(
  rect: { top: number; bottom: number },
  viewportHeight: number,
  direction: number,
  share = EXIT_BAND,
): boolean {
  return direction < 0 ? rect.bottom > viewportHeight * (1 - share) : rect.top < viewportHeight * share;
}
