// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.
/**
 * The swarm's colours. The effects keep their metallic shading; their colours come from the host
 * page: an explicit `palette` option, or `extractPalette()` reading the page's own accents.
 */
import { DEFAULT_AGENTS } from "./agents";
import { createColorResolver, parseColor, type RGB } from "./render/colors";
import { GOLD_TOKEN } from "./theme-fallback";
import type { Agent, Palette } from "./types";

export interface ExtractedPalette {
  /** Six cursor colours, as CSS colour strings. */
  agents: string[];
  /** Band edge, ripples and caret. */
  accent: string;
  /** "fallback" when the page gave no usable colour: the metallic defaults. */
  source: "page" | "fallback";
}

const AGENT_COUNT = 6;
/** Below this HSL chroma a colour counts as a grey. */
const MIN_CHROMA = 0.16;
/** Hues closer than this (degrees) are one colour. */
const HUE_MERGE = 20;
/** Greys closer than this in lightness are one colour. */
const GREY_MERGE = 0.1;
/** WCAG 2.x minimum for graphical objects against the page background. */
const MIN_CONTRAST = 3;
/** Elements read per selector group, so a long page stays cheap. */
const MAX_PER_GROUP = 300;
/** Custom properties read from :root. */
const MAX_VARS = 300;

type Prop = "color" | "backgroundColor" | "borderTopColor" | "backgroundImage";

/** Where the page keeps its accents, with how much each sighting counts. */
const GROUPS: { selector: string; weight: number; props: Prop[] }[] = [
  {
    selector: "button, [role=button], input[type=submit], input[type=button], [class*=btn], [class*=button], [class*=cta]",
    weight: 3,
    props: ["backgroundColor", "backgroundImage", "borderTopColor", "color"],
  },
  { selector: "a[href]", weight: 1, props: ["color"] },
  { selector: "h1, h2, h3, h4", weight: 1, props: ["color"] },
  {
    selector: ":is(h1, h2, h3, h4) :is(span, em, strong, mark, i, b)",
    weight: 2,
    props: ["color", "backgroundColor", "backgroundImage"],
  },
  {
    selector:
      "mark, hr, [class*=badge], [class*=tag], [class*=chip], [class*=pill], [class*=label], [class*=accent], [class*=primary], [class*=brand]",
    weight: 2,
    props: ["backgroundColor", "backgroundImage", "borderTopColor", "color"],
  },
];

type HSL = { h: number; s: number; l: number };
type Sample = { rgb: RGB; weight: number; first: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function hexToRgb(hex: string): RGB | null {
  const m = hex.match(/^#([0-9a-f]{3,8})$/i);
  if (!m || ![3, 4, 6, 8].includes(m[1].length)) return null;
  const s = m[1].length <= 4 ? [...m[1]].map((c) => c + c).join("") : m[1];
  if (s.length === 8 && parseInt(s.slice(6, 8), 16) < 128) return null;
  return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
}

function hslToRgb({ h, s, l }: HSL): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [clamp01(r + m), clamp01(g + m), clamp01(b + m)];
}

function rgbToHsl([r, g, b]: RGB): HSL {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: clamp01(s), l };
}

/**
 * One opaque colour from a CSS colour string: rgb()/rgba(), hsl()/hsla() and hex. Transparent
 * and mostly transparent colours are null, so `transparent` backgrounds never count.
 */
export function readColor(value: string): RGB | null {
  const v = value.trim().toLowerCase();
  if (!v || v === "transparent" || v === "none") return null;
  if (v.startsWith("#")) return hexToRgb(v);
  const alpha = v.match(/^(?:rgb|hsl)a?\([^)]*?[,/]\s*([\d.]+)(%?)\s*\)$/);
  if (alpha && (v.match(/[\d.]+%?/g)?.length ?? 0) >= 4) {
    const a = Number(alpha[1]) / (alpha[2] ? 100 : 1);
    if (a < 0.5) return null;
  }
  const hsl = v.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
  if (hsl) return hslToRgb({ h: Number(hsl[1]), s: Number(hsl[2]) / 100, l: Number(hsl[3]) / 100 });
  return parseColor(v);
}

/** Every colour inside a gradient or other `background-image`. */
function colorsIn(image: string): RGB[] {
  if (!image || image === "none") return [];
  const found = image.match(/rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]{3,8}\b/gi) ?? [];
  return found.map(readColor).filter((c): c is RGB => c !== null);
}

const chroma = ({ s, l }: HSL) => (1 - Math.abs(2 * l - 1)) * s;
const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const isChromatic = (c: HSL) => chroma(c) >= MIN_CHROMA && c.l >= 0.12 && c.l <= 0.92;

function luminance([r, g, b]: RGB): number {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Moves a colour's lightness away from the background until it reaches MIN_CONTRAST. */
export function ensureContrast(c: HSL, bg: RGB): HSL {
  const darker = luminance(bg) > 0.4;
  let out = c;
  for (let i = 0; i < 40 && contrast(hslToRgb(out), bg) < MIN_CONTRAST; i++) {
    out = { ...out, l: clamp01(out.l + (darker ? -0.02 : 0.02)) };
  }
  return out;
}

const css = ([r, g, b]: RGB) => `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;

/** The page's background: body's, else html's, else white. */
function backgroundOf(doc: Document): RGB {
  const view = doc.defaultView ?? window;
  for (const el of [doc.body, doc.documentElement]) {
    if (!el) continue;
    const bg = readColor(view.getComputedStyle(el).backgroundColor);
    if (bg) return bg;
  }
  return [1, 1, 1];
}

/** Custom properties declared on :root or html, from the stylesheets and the computed style. */
function rootVariables(doc: Document): string[] {
  const names = new Set<string>();
  const addFrom = (style: CSSStyleDeclaration) => {
    for (let i = 0; i < style.length && names.size < MAX_VARS; i++) {
      if (style[i].startsWith("--")) names.add(style[i]);
    }
  };
  for (const sheet of [...doc.styleSheets]) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      // A cross-origin stylesheet cannot be read.
      continue;
    }
    for (const rule of [...rules]) {
      if (!("selectorText" in rule) || !("style" in rule)) continue;
      const selector = String(rule.selectorText);
      if (/(^|,)\s*(:root|html)\s*(,|$)/.test(selector)) addFrom(rule.style as CSSStyleDeclaration);
    }
  }
  const view = doc.defaultView ?? window;
  addFrom(view.getComputedStyle(doc.documentElement));
  return [...names].sort();
}

const ownText = (node: Element) =>
  [...node.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());

function collect(doc: Document): Sample[] {
  const view = doc.defaultView ?? window;
  const samples = new Map<string, Sample>();
  let order = 0;
  const add = (rgb: RGB | null, weight: number) => {
    if (!rgb) return;
    const key = css(rgb);
    const known = samples.get(key);
    if (known) known.weight += weight;
    else samples.set(key, { rgb, weight, first: order++ });
  };
  const viewportArea = Math.max(1, view.innerWidth * view.innerHeight);

  for (const { selector, weight, props } of GROUPS) {
    const nodes = [...doc.querySelectorAll(selector)].slice(0, MAX_PER_GROUP);
    for (const node of nodes) {
      const style = view.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = node.getBoundingClientRect();
      // Backgrounds only of small elements: a section's background is the page, not an accent.
      const small = rect.width * rect.height <= viewportArea / 4;
      for (const prop of props) {
        // Text colour only of the element's own text: a link around an image, or around text
        // styled by its children, keeps the browser's blue that nobody sees.
        if (prop === "color") {
          if (ownText(node)) add(readColor(style.color), weight);
        }
        else if (prop === "backgroundColor") {
          if (small) add(readColor(style.backgroundColor), weight);
        } else if (prop === "backgroundImage") {
          if (small) colorsIn(style.backgroundImage).forEach((c) => add(c, weight));
        } else if (style.borderTopStyle !== "none" && parseFloat(style.borderTopWidth) > 0) {
          add(readColor(style.borderTopColor), weight);
        }
      }
    }
  }

  const rootStyle = view.getComputedStyle(doc.documentElement);
  for (const name of rootVariables(doc)) add(readColor(rootStyle.getPropertyValue(name)), 2);

  // Heaviest first; the first seen wins a tie, so the same DOM gives the same palette.
  return [...samples.values()].sort((a, b) => b.weight - a.weight || a.first - b.first);
}

/** Merges colours of one hue (greys: of one lightness); each cluster keeps its heaviest colour. */
function cluster(samples: { hsl: HSL; weight: number }[], grey: boolean) {
  const clusters: { hsl: HSL; weight: number }[] = [];
  for (const s of samples) {
    const near = clusters.find((c) =>
      grey ? Math.abs(c.hsl.l - s.hsl.l) < GREY_MERGE : hueDistance(c.hsl.h, s.hsl.h) < HUE_MERGE,
    );
    if (near) near.weight += s.weight;
    else clusters.push({ ...s });
  }
  return clusters.sort((a, b) => b.weight - a.weight);
}

/** Fills up to six colours: hue shifts of the page's own (lightness steps for greys). */
function expand(base: HSL[], grey: boolean): HSL[] {
  const out = base.slice(0, AGENT_COUNT);
  const distinct = (c: HSL) =>
    out.every((o) => (grey ? Math.abs(o.l - c.l) >= GREY_MERGE : hueDistance(o.h, c.h) >= HUE_MERGE));
  const shifts = grey ? [0.15, -0.15, 0.3, -0.3, 0.45, -0.45] : [30, -30, 60, -60, -90, 90, -120, 120, 150, 180];
  for (const shift of shifts) {
    for (const b of base) {
      if (out.length >= AGENT_COUNT) return out;
      const next = grey ? { ...b, l: clamp01(b.l + shift) } : { ...b, h: (b.h + shift + 360) % 360 };
      if (distinct(next)) out.push(next);
    }
  }
  // Still short (one grey at an extreme): repeat the colours in order.
  for (let i = 0; out.length < AGENT_COUNT; i++) out.push(out[i % out.length]);
  return out;
}

/** The metallic defaults: what the swarm shows when the page gives nothing to work with. */
export const FALLBACK_PALETTE: ExtractedPalette = {
  agents: DEFAULT_AGENTS.map((a) => a.color),
  accent: GOLD_TOKEN,
  source: "fallback",
};

/**
 * Reads the page's own accent colours: links, buttons, heading accents, small badges and
 * borders, and colour custom properties on :root. Greys, near-white and near-black count only
 * when the page has no other colour. Colours of one hue are merged; each is moved in lightness
 * until it stands out against the page background. Gives six cursor colours (hue shifts of the
 * page's own when it has fewer) and the accent, the most frequent saturated colour. The same DOM
 * gives the same palette. FALLBACK_PALETTE when the page has no usable colour.
 */
export function extractPalette(doc: Document = document): ExtractedPalette {
  if (!doc.documentElement) return FALLBACK_PALETTE;
  const samples = collect(doc).map((s) => ({ hsl: rgbToHsl(s.rgb), weight: s.weight }));
  const chromatic = samples.filter((s) => isChromatic(s.hsl));
  const grey = chromatic.length === 0;
  const pool = grey ? samples : chromatic;
  if (!pool.length) return FALLBACK_PALETTE;
  const bg = backgroundOf(doc);
  const clusters = cluster(pool, grey);
  const agents = expand(
    clusters.map((c) => c.hsl),
    grey,
  ).map((c) => css(hslToRgb(ensureContrast(c, bg))));
  return { agents, accent: agents[0], source: "page" };
}

/** Label text that reads on a pill of this colour. */
function textOn(rgb: RGB): string {
  return luminance(rgb) > 0.36 ? "var(--color-ink)" : "var(--color-pearl)";
}

/**
 * The cursors and the accent for one swarm. `palette.agents` recolours the agents (named by
 * `agents` or the defaults), cycling when it is shorter; a palette without `accent` uses its
 * first agent colour. Without `palette`, explicit `agents` keep their colours and the rest comes
 * from extractPalette().
 */
export function resolvePalette(
  options: { agents?: Agent[]; palette?: Palette },
  doc: Document = document,
  /** The cast when `options.agents` is empty (the swarm's own, for `agents: "auto"`). */
  cast: Agent[] = DEFAULT_AGENTS,
): { agents: Agent[]; accent: string } {
  const named = options.agents?.length ? options.agents : cast;
  const explicit = options.palette;
  const auto = explicit ? null : extractPalette(doc);
  const colors = explicit?.agents?.length
    ? explicit.agents
    : !options.agents?.length && auto?.source === "page"
      ? auto.agents
      : null;
  const accent = explicit ? (explicit.accent ?? explicit.agents?.[0] ?? GOLD_TOKEN) : auto!.accent;
  if (!colors) return { agents: named, accent };
  const resolve = createColorResolver();
  const agents = named.map((agent, i) => {
    const color = colors[i % colors.length];
    return { ...agent, color, text: textOn(resolve(color)) };
  });
  return { agents, accent };
}
