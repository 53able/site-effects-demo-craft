// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.
import { PREMUL } from "./quad";

// The arrow is the original cursor path (swarm-build.js:58): "M1.5 1.5v15l4-4 3 6.2 2.6-1.2-3-6.1h5.6z".

/** The arrow's viewBox (16 × 20) plus room for its stroke and shadow, in arrow units. */
export const CURSOR_PAD = 3;
export const CURSOR_BOX = { width: 16 + CURSOR_PAD * 2, height: 20 + CURSOR_PAD * 2 };
/** Where the arrow's tip sits, in arrow units from the cursor's anchor. */
export const CURSOR_TIP = { x: 1.5, y: 1.5 };

/**
 * A machined-metal arrow for light and dark pages alike, from the signed distance field of the
 * original path: a brushed body in the agent's colour reflecting a studio light, bevelled edges
 * (bright upper-left, dark lower-right), a Fresnel rim, a dark hairline and a soft drop shadow.
 * A sharp specular band sits across the direction of travel and slides forward with speed.
 */
export const CURSOR_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
uniform float uScale;
uniform vec3 uColor;
uniform float uTime;
uniform vec2 uDir;
out vec4 fragColor;
${PREMUL}

const int N = 7;
const vec2 P[7] = vec2[7](
  vec2(1.5, 1.5), vec2(1.5, 16.5), vec2(5.5, 12.5), vec2(8.5, 18.7),
  vec2(11.1, 17.5), vec2(8.1, 11.4), vec2(13.7, 11.4)
);

float sdArrow(vec2 p) {
  float d = dot(p - P[0], p - P[0]);
  float s = 1.0;
  int j = N - 1;
  for (int i = 0; i < N; i++) {
    vec2 e = P[j] - P[i];
    vec2 w = p - P[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= P[i].y, p.y < P[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s = -s;
    j = i;
  }
  return s * sqrt(d);
}

void main() {
  vec2 p = vLocal / uScale - ${CURSOR_PAD.toFixed(1)};
  float d = sdArrow(p);
  float aa = max(fwidth(d), 1e-3);
  float outer = 1.0 - smoothstep(0.6 - aa, 0.6 + aa, d);
  float fill = 1.0 - smoothstep(-0.4 - aa, -0.4 + aa, d);
  float ds = sdArrow(p - vec2(0.7, 1.3));
  float shadow = (1.0 - smoothstep(-1.2, 1.8, ds)) * 0.26;

  float speed = length(uDir);
  vec2 dir = speed > 1e-3 ? uDir / speed : vec2(0.7071, 0.7071);
  // Centred on the arrow at rest; up to 6 units towards its leading side when it moves fast,
  // with a slow drift so it lives at rest too.
  vec2 c = vec2(7.0, 10.0);
  float slide = clamp(speed * 0.5, 0.0, 6.0) + sin(uTime * 1.3) * 1.5;
  float s = (dot(p - c, dir) - slide) / 2.2;
  vec2 grad = vec2(dFdx(d), dFdy(d));
  vec2 n = length(grad) > 1e-5 ? normalize(grad) : vec2(0.0, -1.0);
  float t = clamp((p.y * 0.85 + p.x * 0.35) / 19.0, 0.0, 1.0);
  vec3 body = metalSurface(uColor, p * 4.0, t, normalize(vec2(0.35, 0.94)), d, n, 1.6, s, 1.0);

  vec4 o = over(premul(body, fill), over(premul(inkOf(uColor), outer * 0.9), premul(vec3(0.0), shadow)));
  fragColor = premul(o.rgb / max(o.a, 1e-4), o.a);
}
`;
