// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.
/**
 * The swarm palette, used only when a theme token cannot be read from the page (for example
 * before the stylesheet loads). Existing page tokens take precedence.
 */
export const THEME_FALLBACK: Readonly<Record<string, string>> = {
  "--color-champagne": "#E8D3A2",
  "--color-platinum": "#D9DDE3",
  "--color-rose-gold": "#D8A39D",
  "--color-bronze": "#B08D57",
  "--color-gunmetal": "#4A4E57",
  "--color-pearl": "#F3EFE7",
  "--color-ink": "#0B0B0D",
};

/** The gold every band, caret and hairline is tinted with. */
export const GOLD_TOKEN = "var(--color-champagne)";
