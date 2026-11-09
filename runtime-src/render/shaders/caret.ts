// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.
import { PREMUL } from "./quad";

/** Padding around the caret for its glint, in CSS px. */
export const CARET_PAD = 10;

/**
 * A typing block's caret: a 2px polished metal-gold bar (lit left face, dark right face, a
 * specular glint running down it) with a dark hairline shadow beside it and a pulsing four-point
 * glint at its top.
 */
export const CARET_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
uniform vec4 uRect;
uniform vec3 uGold;
uniform float uTime;
out vec4 fragColor;
${PREMUL}

void main() {
  vec2 p = vLocal - vec2(${CARET_PAD.toFixed(1)});
  float h = uRect.w - ${(CARET_PAD * 2).toFixed(1)};
  float span = step(0.0, p.y) * step(p.y, h);
  float bar = (1.0 - smoothstep(0.75, 1.5, abs(p.x))) * span;
  float shade = (1.0 - smoothstep(0.4, 1.0, abs(p.x - 1.8))) * span * 0.35;
  vec2 g = p - vec2(0.0, 1.0);
  float pulse = 0.7 + 0.3 * sin(uTime * 6.0);
  float star = (exp(-abs(g.x) * 1.4) * exp(-abs(g.y) * 0.35) + exp(-abs(g.y) * 1.4) * exp(-abs(g.x) * 0.35)) * pulse;
  float face = clamp(p.x * 0.5 + 0.5, 0.0, 1.0);
  vec3 gold = uGold * (0.45 + 0.75 * studio(0.15 + face * 0.7)) + vec3(1.0) * 0.3 * pow(studio(0.15 + face * 0.7), 4.0);
  float run = mod(uTime * 1.6, 1.6) * h - 0.3 * h;
  gold = mix(gold, vec3(1.0, 0.99, 0.95), exp(-pow((p.y - run) / 3.0, 2.0)) * 0.85);
  vec4 o = over(premul(mix(uGold, vec3(1.0), 0.5), star * 0.6), over(premul(gold * 0.85, bar), premul(inkOf(uGold), shade)));
  fragColor = premul(o.rgb / max(o.a, 1e-4), o.a);
}
`;
