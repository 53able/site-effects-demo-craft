// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.
import { PREMUL } from "./quad";

/** Most points a trail uniform holds; matches render/trail.ts. */
export const TRAIL_MAX = 24;

/**
 * A tapered metal comet behind a cursor along the polyline through uPts (oldest first): a
 * bright metal core in the agent's colour that darkens towards its edges, so it reads on white
 * as well as on colour. Width tapers to 0 and opacity fades towards the oldest point; it is
 * uWidth (the scale) times as wide.
 */
export const TRAIL_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
uniform vec4 uRect;
uniform vec2 uPts[${TRAIL_MAX}];
uniform int uCount;
uniform vec3 uColor;
uniform vec3 uGold;
uniform float uWidth;
out vec4 fragColor;
${PREMUL}

void main() {
  vec2 p = uRect.xy + vLocal;
  float cover = 0.0;
  float edge = 1.0;
  float fade = 0.0;
  float last = float(max(uCount - 1, 1));
  for (int i = 0; i < ${TRAIL_MAX - 1}; i++) {
    if (i + 1 >= uCount) break;
    vec2 a = uPts[i];
    vec2 b = uPts[i + 1];
    vec2 ab = b - a;
    float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
    float d = length(p - a - ab * h);
    float age = (float(i) + h) / last;
    float w = (1.7 * age + 0.15) * uWidth;
    float c = clamp(w - d + 0.5, 0.0, 1.0);
    if (c > cover) {
      cover = c;
      edge = clamp(d / w, 0.0, 1.0);
      fade = age * age;
    }
  }
  vec3 tint = mix(uColor, uGold, 0.4);
  vec3 col = mix(mix(tint, vec3(1.0), 0.45), inkOf(tint), smoothstep(0.25, 1.0, edge));
  fragColor = premul(col, cover * fade * 0.9);
}
`;
