// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.

import { ROLES, type Role } from "./roles";
import type { Agent } from "./types";

/**
 * Twelve agents named after what they build (`layout-agent`, `type-agent`, ...), one per role.
 * Kept for existing callers; their name tags show the short form (`layout`, `type`; see
 * agentLabel). With roles in use the swarm now sizes its own cast by default (`agents: "auto"`).
 */
export const AGENT_NAMES: readonly string[] = ROLES.map((role) => `${role}-agent`);

/** How many agents `agents: "auto"` runs, at most (never more than there are blocks). */
export const AUTO_HEADCOUNT = 12;

const COLORS: Pick<Agent, "color" | "text">[] = [
  { color: "var(--color-champagne)", text: "var(--color-ink)" },
  { color: "var(--color-platinum)", text: "var(--color-ink)" },
  { color: "var(--color-rose-gold)", text: "var(--color-ink)" },
  { color: "var(--color-bronze)", text: "var(--color-ink)" },
  { color: "var(--color-gunmetal)", text: "var(--color-pearl)" },
  { color: "var(--color-pearl)", text: "var(--color-ink)" },
];

/** The six default agents: the first six roles. Colours are theme tokens; the renderer resolves them. */
export const DEFAULT_AGENTS: Agent[] = ROLES.slice(0, 6).map((role, i) => ({
  name: `${role}-agent`,
  role,
  ...COLORS[i],
}));

/** An agent's name tag: `type-agent` shows as `type`; any other name as it is. */
export function agentLabel(name: string): string {
  const match = /^([a-z]+)-agent$/.exec(name);
  return match && (ROLES as readonly string[]).includes(match[1]) ? match[1] : name;
}

/**
 * Seats per role for `total` agents, in proportion to how many blocks each role has (largest
 * remainder; ties go to the role first in ROLES). A role with no blocks gets none; every role
 * that has blocks gets at least one while `total` allows, taken from the role most over its quota.
 */
export function allocateHeadcount(histogram: Partial<Record<Role, number>>, total = AUTO_HEADCOUNT): Map<Role, number> {
  const present = ROLES.filter((r) => (histogram[r] ?? 0) > 0);
  const blocks = present.reduce((sum, r) => sum + histogram[r]!, 0);
  const seats = new Map<Role, number>();
  if (!blocks || total <= 0) return seats;
  const quota = new Map(present.map((r) => [r, (total * histogram[r]!) / blocks]));
  for (const r of present) seats.set(r, Math.floor(quota.get(r)!));
  let left = total - [...seats.values()].reduce((a, b) => a + b, 0);
  const byRemainder = [...present].sort((a, b) => {
    const fa = quota.get(a)! % 1;
    const fb = quota.get(b)! % 1;
    return fb - fa || ROLES.indexOf(a) - ROLES.indexOf(b);
  });
  for (const r of byRemainder) {
    if (left <= 0) break;
    seats.set(r, seats.get(r)! + 1);
    left--;
  }
  // At least one seat per role present, while some role can spare one.
  for (const r of present) {
    if (seats.get(r)! > 0) continue;
    let donor: Role | undefined;
    for (const d of present) {
      if (seats.get(d)! < 2) continue;
      const over = seats.get(d)! - quota.get(d)!;
      if (!donor || over > seats.get(donor)! - quota.get(donor)!) donor = d;
    }
    if (!donor) break;
    seats.set(donor, seats.get(donor)! - 1);
    seats.set(r, 1);
  }
  for (const r of present) if (!seats.get(r)) seats.delete(r);
  return seats;
}

/**
 * The cast for `agents: "auto"`: `total` agents split over the roles of `roles` (one entry per
 * block) by allocateHeadcount. Named after their role, numbered within it when it has more than
 * one (`type-1` … `type-4`, `layout`), and ordered round-robin from the busiest role, so the first
 * cursors in cover different roles. Colours cycle through the defaults; the palette replaces them.
 */
export function autoAgents(roles: readonly (Role | undefined)[], total = AUTO_HEADCOUNT): Agent[] {
  const histogram: Partial<Record<Role, number>> = {};
  for (const r of roles) if (r) histogram[r] = (histogram[r] ?? 0) + 1;
  const seats = allocateHeadcount(histogram, Math.min(total, roles.length));
  const order = [...seats.keys()].sort((a, b) => histogram[b]! - histogram[a]! || ROLES.indexOf(a) - ROLES.indexOf(b));
  const agents: Agent[] = [];
  for (let round = 0; agents.length < [...seats.values()].reduce((a, b) => a + b, 0); round++) {
    for (const role of order) {
      const n = seats.get(role)!;
      if (round >= n) continue;
      const i = agents.length;
      agents.push({ name: n > 1 ? `${role}-${round + 1}` : role, role, ...COLORS[i % COLORS.length] });
    }
  }
  return agents;
}
