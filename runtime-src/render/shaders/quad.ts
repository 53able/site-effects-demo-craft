// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.
/**
 * Shared vertex stage: a unit quad placed at `uRect` (x, y, width, height in CSS pixels).
 * `vLocal` is the fragment's offset from the rect's top-left, in CSS pixels.
 */
export const QUAD_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
uniform vec4 uRect;
uniform vec2 uViewport;
out vec2 vLocal;
void main() {
  vLocal = aPos * uRect.zw;
  vec2 clip = (uRect.xy + vLocal) / uViewport * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

/**
 * Every fragment shader's only output: a valid premultiplied colour (rgb <= a). The overlay
 * canvas is composited normally (premultiplied source-over), so the marks must read on light
 * pages as well as dark: metal bodies with a dark hairline and a soft shadow under them.
 *
 * `over` stacks two premultiplied layers; `metal` shades a colour as polished metal along t in
 * 0..1 (bright top, a horizon line at the middle, a darker lower half lifting again at the bottom);
 * `inkOf` is the dark hairline tinted towards a colour.
 */
export const PREMUL = `
vec4 premul(vec3 color, float a) {
  a = clamp(a, 0.0, 1.0);
  return vec4(clamp(color, 0.0, 1.0) * a, a);
}
vec4 over(vec4 top, vec4 bottom) {
  return top + bottom * (1.0 - top.a);
}
vec3 metal(vec3 c, float t) {
  vec3 hi = mix(c, vec3(1.0), 0.65);
  vec3 lo = c * 0.62;
  float h = smoothstep(0.44, 0.56, t);
  vec3 top = mix(hi, c, smoothstep(0.0, 0.5, t));
  vec3 bottom = mix(lo, mix(c, hi, 0.3), smoothstep(0.5, 1.0, t));
  return mix(top, bottom, h);
}
vec3 inkOf(vec3 c) {
  return mix(vec3(0.06, 0.055, 0.05), c * 0.35, 0.35);
}
float mhash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float mnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mhash(i), mhash(i + vec2(1.0, 0.0)), u.x), mix(mhash(i + vec2(0.0, 1.0)), mhash(i + 1.0), u.x), u.y);
}
// Brushed metal: fine hairline streaks along \`axis\` (unit), 0..1. Stretched value noise: high
// frequency across the axis, almost none along it.
float brushed(vec2 p, vec2 axis) {
  vec2 q = vec2(dot(p, vec2(-axis.y, axis.x)), dot(p, axis));
  return 0.6 * mnoise(vec2(q.x * 2.3, q.y * 0.06)) + 0.4 * mnoise(vec2(q.x * 5.1 + 3.0, q.y * 0.11));
}
// A soft studio environment along t in 0..1 (top to bottom): a bright softbox near the top, a dark
// band, a lit floor, so a surface reads as a reflection rather than a flat gradient.
float studio(float t) {
  float box = smoothstep(0.08, 0.2, t) * (1.0 - smoothstep(0.32, 0.44, t));
  float floor_ = smoothstep(0.62, 0.95, t) * 0.55;
  return 0.18 + 0.82 * box + floor_;
}
// A machined metal surface in colour c: studio reflection along t, brushed streaks along axis,
// a bevel from the shape's signed distance d (< 0 inside) and its outward normal n (bright
// upper-left chamfer, dark lower-right), a sharp specular band at s (0 = on it, \`gain\` bright)
// and a Fresnel rim.
vec3 metalSurface(vec3 c, vec2 p, float t, vec2 axis, float d, vec2 n, float bevel, float s, float gain) {
  float edge = 1.0 - smoothstep(0.0, bevel, -d);
  float lit = dot(n, normalize(vec2(-0.62, -0.78)));
  float env = studio(clamp(t - 0.18 * lit * edge, 0.0, 1.0));
  vec3 col = c * (0.42 + 0.7 * env) + vec3(1.0) * 0.38 * pow(env, 4.0);
  col *= 0.86 + 0.28 * brushed(p, axis);
  col = mix(col, mix(c, vec3(1.0), 0.85), edge * max(lit, 0.0) * 0.9);
  col = mix(col, c * 0.22, edge * max(-lit, 0.0) * 0.75);
  col += vec3(1.0, 0.99, 0.96) * gain * exp(-s * s);
  col += vec3(1.0) * 0.12 * edge;
  return clamp(col, 0.0, 1.0);
}
`;

/** Signed distance to a rounded box centred on the origin. */
export const SD_ROUND_BOX = `
float sdRoundBox(vec2 p, vec2 halfSize, float r) {
  r = min(r, min(halfSize.x, halfSize.y));
  vec2 q = abs(p) - halfSize + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
`;
