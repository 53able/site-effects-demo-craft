// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.

import { swarmBuild } from "./image-mode";
import type { Options, SwarmBuild } from "./types";

export { AGENT_NAMES, AUTO_HEADCOUNT, DEFAULT_AGENTS, agentLabel, allocateHeadcount, autoAgents } from "./agents";
export { extractPalette, FALLBACK_PALETTE, resolvePalette } from "./palette";
export type { ExtractedPalette } from "./palette";
export { autoRegions, parseRegions } from "./regions";
export { blockFeatures, classifyRole, pickTask, roleOfAgent, ROLES } from "./roles";
export type { BlockFeatures, Role } from "./roles";
export { HIDDEN, sweep, sweepFront } from "./clip";
export { swarmBuild } from "./image-mode";
export { swarmBuildPage } from "./page-mode";
export { createRenderer, defaultRendererFactory, setRendererFactory } from "./render/factory";
export type { RendererFactory } from "./render/factory";
export type { Renderer, RendererOptions, Scene } from "./render/renderer";
export type { RevealKind, RevealStrategy } from "./reveal/strategy";
export type * from "./types";

/** Builds every element with a `data-swarm` attribute, each with its own swarm. */
export function swarmBuildAll(selector = "[data-swarm]", options?: Options): SwarmBuild[] {
  return [...document.querySelectorAll(selector)].map((node) => swarmBuild(node, options));
}
