// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.

/** Rejection reason for tweens once the swarm has ended; never logged. */
export const ABORT = Symbol("swarm-build destroyed");

/** Animates t from 0 to 1 over `seconds`; rejects with ABORT once the swarm has ended. */
export type TweenFn = (seconds: number, update?: (t: number) => void) => Promise<void>;

interface Tween {
  t: number;
  duration: number;
  update: (t: number) => void;
  resolve: () => void;
  reject: (reason: unknown) => void;
}

/**
 * One rAF loop drives every tween. Each tick runs in a fixed order: settle the tweens (which
 * write clip-paths), then `onFrame` (which builds the scene and hands it to the renderer).
 */
export function createLoop(onFrame: () => void, initialSpeed: number) {
  const active = new Set<Tween>();
  let speed = initialSpeed;
  let frame = 0;
  let last = 0;
  /** Loop time in ms: real time times the speed, from the first frame. */
  let elapsed = 0;
  let ended = false;
  let done = false;

  const settle = (tw: Tween, t: number) => {
    tw.update(t);
    if (t >= 1) {
      active.delete(tw);
      tw.resolve();
    }
  };
  const tick = (now: number) => {
    if (ended) return;
    // Clamped so a tab coming back from the background doesn't jump to the end.
    const dt = last ? Math.min(now - last, 100) * speed : 0;
    last = now;
    elapsed += dt;
    for (const tw of [...active]) settle(tw, Math.min(1, (tw.t += dt / tw.duration)));
    onFrame();
    frame = requestAnimationFrame(tick);
  };
  const tween: TweenFn = (seconds, update = () => {}) =>
    new Promise<void>((resolve, reject) => {
      if (ended) return reject(ABORT);
      const tw: Tween = { t: 0, duration: Math.max(1, seconds * 1000), update, resolve, reject };
      if (done) settle(tw, 1);
      else active.add(tw);
    });

  return {
    tween,
    start() {
      frame = requestAnimationFrame(tick);
    },
    /** Every future tween settles at once. */
    markDone() {
      done = true;
    },
    /** Every running tween jumps to its end. */
    settleActive() {
      [...active].forEach((tw) => settle(tw, 1));
    },
    get done() {
      return done;
    },
    /** Seconds of loop time (scaled by the speed) since the loop started. */
    get time() {
      return elapsed / 1000;
    },
    /** Cancels the frame and rejects every running tween with ABORT. */
    stop() {
      ended = true;
      cancelAnimationFrame(frame);
      active.forEach((tw) => tw.reject(ABORT));
      active.clear();
    },
    setSpeed(value: number) {
      speed = value;
    },
  };
}
