// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.
import { PREMUL, SD_ROUND_BOX } from "./quad";

/** Room around a drag box for its under-stroke, in CSS px at scale 1. */
export const BOX_PAD = 4;
/** Room around a pill for its drop shadow, in CSS px at scale 1 (rounded to whole device pixels). */
export const PILL_PAD = 4;

/**
 * The drag box (swarm-build.js:257-272): a thin polished metal wire in the agent's colour warmed
 * towards gold, with a specular glint travelling along its length, a faint dark under-stroke
 * offset down and right so it reads on white, and a barely-there fill, inside the border radius.
 * The line, its under-stroke and the glint are `uLine` (the scale) times as wide.
 */
export const BOX_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
uniform vec4 uRect;
uniform vec2 uSize;
uniform float uRadius;
uniform vec3 uColor;
uniform vec3 uGold;
uniform float uOpacity;
uniform float uTime;
uniform float uLine;
out vec4 fragColor;
${SD_ROUND_BOX}${PREMUL}
void main() {
  vec2 q = vLocal - uRect.zw * 0.5;
  float d = sdRoundBox(q, uSize * 0.5, uRadius);
  float inside = 1.0 - smoothstep(-0.5, 0.5, d);
  float hair = inside * smoothstep(-0.5 - uLine, -0.5, d);
  float du = sdRoundBox(q - vec2(0.6, 1.0) * uLine, uSize * 0.5, uRadius);
  float under = (1.0 - smoothstep(-0.5, 0.5, du)) * smoothstep(-0.6 - uLine, -0.6, du) * 0.32;
  vec3 c = mix(uColor, uGold, 0.45);
  vec2 n = (q + uSize * 0.5) / max(uSize, vec2(1.0));
  // Polished wire: a hard studio reflection by side (top and left catch the light), and a glint
  // running around the perimeter.
  float side = abs(q.x / max(uSize.x, 1.0)) > abs(q.y / max(uSize.y, 1.0)) ? (q.x < 0.0 ? 0.15 : 0.75) : (q.y < 0.0 ? 0.12 : 0.85);
  vec3 line = c * (0.45 + 0.7 * studio(side)) + vec3(1.0) * 0.3 * pow(studio(side), 4.0);
  float per = 2.0 * (uSize.x + uSize.y);
  float u = atan(q.y * uSize.x, q.x * uSize.y) / 6.2831 + 0.5;
  float g = fract(u - uTime * 0.35);
  float glint = exp(-pow(min(g, 1.0 - g) * per / (18.0 * uLine), 2.0));
  line = mix(line, vec3(1.0, 0.99, 0.95), glint * 0.85);
  vec4 o = over(premul(line, hair * (0.85 + 0.15 * glint)), over(premul(inkOf(c), under), premul(c, 0.07 * inside)));
  fragColor = premul(o.rgb / max(o.a, 1e-4), o.a * uOpacity);
}
`;

/**
 * A machined-metal pill with text from the text atlas: the agent's name tag
 * (swarm-build.js:188-201) and the "W × H" badge (swarm-build.js:275-291). Brushed along its
 * length, reflecting a studio light, bevelled (bright upper-left, dark lower-right), with a slow
 * specular glint, a dark hairline edge and a soft drop shadow. The pill (uSize) sits uPad
 * (PILL_PAD at the scale) inside the quad; the hairline, bevel, shadow, brushing and glint grow
 * with uScale. The text is white in the atlas and tinted here.
 */
export const LABEL_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
uniform vec4 uRect;
uniform vec2 uSize;
uniform float uRadius;
uniform vec3 uColor;
uniform vec3 uTextColor;
uniform float uOpacity;
uniform sampler2D uAtlas;
uniform vec4 uUV;
uniform vec4 uText;
uniform float uHasText;
uniform float uTime;
uniform float uScale;
uniform float uPad;
out vec4 fragColor;
${SD_ROUND_BOX}${PREMUL}
void main() {
  vec2 local = vLocal - vec2(uPad);
  vec2 half_ = uSize * 0.5;
  float d = sdRoundBox(local - half_, half_, uRadius);
  float cover = 1.0 - smoothstep(-0.5, 0.5, d);
  float rim = cover * smoothstep(-0.5 - uScale, -0.5, d);
  float ds = sdRoundBox(local - half_ - vec2(0.0, 1.2 * uScale), half_, uRadius);
  float shadow = (1.0 - smoothstep(-1.0 * uScale, 2.5 * uScale, ds)) * 0.24;
  vec2 grad = vec2(dFdx(d), dFdy(d));
  vec2 n = length(grad) > 1e-5 ? normalize(grad) : vec2(0.0, -1.0);
  float s = (local.x - mod(uTime * 40.0 * uScale + uRect.x * 3.0, uSize.x + 160.0 * uScale) + 40.0 * uScale + (local.y - half_.y) * 0.6) / (5.0 * uScale);
  vec3 col = metalSurface(uColor, local * 2.0 / uScale, clamp(local.y / uSize.y, 0.0, 1.0), vec2(1.0, 0.0), d, n, 2.2 * uScale, s, 0.32);
  col = mix(col, inkOf(uColor), rim * 0.55);
  vec2 t = (local - uText.xy) / uText.zw;
  if (uHasText > 0.5 && all(greaterThanEqual(t, vec2(0.0))) && all(lessThanEqual(t, vec2(1.0)))) {
    float ink = texture(uAtlas, mix(uUV.xy, uUV.zw, t)).a;
    col = mix(col, uTextColor, ink);
  }
  vec4 o = over(premul(col, cover), premul(vec3(0.0), shadow));
  fragColor = premul(o.rgb / max(o.a, 1e-4), o.a * uOpacity);
}
`;
