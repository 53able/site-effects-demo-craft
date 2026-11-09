// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.
import { PREMUL, SD_ROUND_BOX } from "./quad";

/** Seconds a ripple lasts. */
export const RIPPLE_SECONDS = 0.6;
/** How far past the block's edge the ring travels, in CSS px. */
export const RIPPLE_REACH = 28;

/** Seconds the completion light takes to cross a built block. */
export const SWEEP_LIGHT_SECONDS = 0.42;

/**
 * As a block is built: a single specular light sweeps diagonally across its rect (light only,
 * SWEEP_LIGHT_SECONDS), and a thin metal-rimmed ring leaves its outline (a fine gold core, lit
 * on its outer edge, over a faint dark shadow ring), easing outwards and fading by RIPPLE_SECONDS.
 */
export const RIPPLE_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
uniform vec4 uRect;
uniform vec2 uBlock;
uniform float uRadius;
uniform float uAge;
uniform vec3 uColor;
uniform vec3 uGold;
out vec4 fragColor;
${SD_ROUND_BOX}${PREMUL}
void main() {
  float k = clamp(uAge / ${RIPPLE_SECONDS.toFixed(2)}, 0.0, 1.0);
  float d = sdRoundBox(vLocal - uRect.zw * 0.5, uBlock * 0.5, uRadius);
  float r = (1.0 - (1.0 - k) * (1.0 - k)) * ${RIPPLE_REACH.toFixed(1)};
  float x = d - r;
  float core = 1.0 - smoothstep(0.3, 0.8, abs(x));
  float shade = exp(-pow(x - 1.3, 2.0) / 0.6) * 0.26;
  float life = (1.0 - k) * (1.0 - k) * smoothstep(0.0, 0.06, k) * step(0.0, d);
  vec3 gold = mix(uColor, uGold, 0.7);
  vec3 rim = mix(gold * 0.55, mix(gold, vec3(1.0), 0.8), smoothstep(-0.6, 0.6, x));
  vec4 ring = over(premul(rim, core * 0.95), premul(inkOf(gold), shade));
  ring.rgb *= life;
  ring.a *= life;
  // The light sweep: a soft diagonal band crossing the block once, inside it only.
  float ks = clamp(uAge / ${SWEEP_LIGHT_SECONDS.toFixed(2)}, 0.0, 1.0);
  vec2 local = (vLocal - uRect.zw * 0.5) / max(uBlock, vec2(1.0)) + 0.5;
  float diag = (local.x + local.y * 0.45) / 1.45;
  float pos = mix(-0.25, 1.25, ks);
  float band = exp(-pow((diag - pos) / 0.07, 2.0)) * step(d, 0.0) * (1.0 - step(1.0, ks));
  vec4 light = premul(vec3(1.0, 0.99, 0.96), band * 0.22);
  vec4 o = over(ring, light);
  fragColor = premul(o.rgb / max(o.a, 1e-4), o.a);
}
`;
