// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.
import { PREMUL } from "./quad";

/** Height of the dissolving strip above the sweep front, in CSS px. */
export const BAND_STRIP = 56;

/**
 * Option D's reveal glow (plan §3.3): a polished metal line at the sweep front from
 * sweepFront(rect, e), with a specular sweep travelling along it and a slight chromatic sheen at
 * its edges, a thin dark shadow line just under it so it reads on white, a subtle warm glow
 * above it and faint gold noise drifting through the strip being revealed. Composited normally
 * over the page; the side overhang fades in softly.
 */
export const BAND_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
uniform vec4 uRect;
uniform float uFront;
uniform float uTop;
uniform float uE;
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uGold;
out vec4 fragColor;
${PREMUL}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), u.x), u.y);
}
float fbm(vec2 p) {
  return 0.55 * noise(p) + 0.3 * noise(p * 2.03 + 7.1) + 0.15 * noise(p * 4.1 + 3.7);
}

void main() {
  vec2 p = uRect.xy + vLocal;
  if (p.y < uTop) discard;
  float dy = uFront - p.y;
  float side = smoothstep(0.0, 40.0, p.x - uRect.x) * smoothstep(0.0, 40.0, uRect.x + uRect.z - p.x);
  float fade = (1.0 - smoothstep(0.82, 1.0, uE)) * side;
  vec3 gold = mix(uColor, uGold, 0.75);
  float line = 1.0 - smoothstep(0.55, 1.05, abs(dy));
  float shade = exp(-pow(dy + 1.7, 2.0) / 0.45) * 0.38;
  float glow = dy >= 0.0 ? exp(-dy / 10.0) * 0.12 : 0.0;
  float strip = clamp(dy / ${BAND_STRIP.toFixed(1)}, 0.0, 1.0);
  float n = fbm(vec2(p.x * 0.03, p.y * 0.05 - uTime * 0.6));
  float shimmer = step(0.0, dy) * (1.0 - strip) * (1.0 - strip) * smoothstep(0.45, 0.85, n) * 0.12;
  // The line is a polished rod: lit on its upper half, dark under it, with a hot specular core.
  float across = clamp(dy * 0.5 + 0.5, 0.0, 1.0);
  vec3 rod = gold * (0.45 + 0.75 * studio(1.0 - across)) + vec3(1.0) * 0.25 * pow(studio(1.0 - across), 4.0);
  float w = uRect.z;
  float pos = mod(uTime * 520.0, w + 400.0) - 200.0;
  float sweep = exp(-pow((p.x - uRect.x - pos) / 70.0, 2.0));
  float glint = pow(max(0.0, sin(p.x * 0.031 - uTime * 3.5)), 24.0) * 0.5;
  vec3 hot = vec3(1.0, 0.99, 0.95);
  // Chromatic sheen: warm just above the core, cool just below, only where the sweep is.
  vec3 sheen = mix(vec3(1.0, 0.82, 0.55), vec3(0.6, 0.85, 1.0), smoothstep(-0.8, 0.8, -dy));
  vec3 edge = mix(rod, hot, clamp(sweep + glint, 0.0, 1.0) * 0.9);
  edge = mix(edge, sheen, sweep * 0.25 * (1.0 - smoothstep(0.0, 0.6, abs(abs(dy) - 0.7))));
  float lineA = line * (0.9 + 0.1 * sweep);
  float halo = exp(-pow(dy / 2.2, 2.0)) * sweep * 0.35;
  vec4 o = over(premul(edge, lineA), over(premul(hot, halo), over(premul(gold * 0.8, glow + shimmer), premul(inkOf(gold), shade))));
  fragColor = premul(o.rgb / max(o.a, 1e-4), o.a * fade);
}
`;
