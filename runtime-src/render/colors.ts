// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.
import { THEME_FALLBACK } from "../theme-fallback";

export type RGB = [number, number, number];

const TOKEN = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/;

/** Parses `rgb()`/`rgba()` and six-digit hex, the forms computed colours and the fallbacks use. */
export function parseColor(value: string): RGB | null {
  const v = value.trim();
  const rgb = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
  const hex = v.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex) return [parseInt(hex[1], 16) / 255, parseInt(hex[2], 16) / 255, parseInt(hex[3], 16) / 255];
  return null;
}

/** Any CSS colour to RGB through a 1×1 2D canvas, for forms like oklch() that parseColor skips. */
function paint(value: string): RGB | null {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return a ? [r / 255, g / 255, b / 255] : null;
}

/**
 * Resolves colour strings, theme tokens like `var(--color-champagne)` included, to RGB at
 * runtime: through the computed style of a probe element, or THEME_FALLBACK when the page does
 * not define the token. Results are cached; the probe never stays in the document.
 */
export function createColorResolver(): (css: string) => RGB {
  const cache = new Map<string, RGB>();
  const champagne = parseColor(THEME_FALLBACK["--color-champagne"])!;

  const viaProbe = (css: string): RGB | null => {
    const probe = document.createElement("span");
    probe.style.display = "none";
    probe.style.color = css;
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    return parseColor(computed) ?? paint(computed);
  };

  const resolve = (css: string): RGB => {
    const token = css.trim().match(TOKEN);
    if (token) {
      const [, name, fallback] = token;
      const defined = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      if (!defined) {
        const known = THEME_FALLBACK[name] ?? fallback;
        return (known && (parseColor(known) ?? resolve(known))) || champagne;
      }
      return viaProbe(css) ?? parseColor(defined) ?? paint(defined) ?? parseColor(THEME_FALLBACK[name] ?? "") ?? champagne;
    }
    return parseColor(css) ?? viaProbe(css) ?? paint(css) ?? champagne;
  };

  return (css) => {
    let rgb = cache.get(css);
    if (!rgb) {
      rgb = resolve(css);
      cache.set(css, rgb);
    }
    return rgb;
  };
}
