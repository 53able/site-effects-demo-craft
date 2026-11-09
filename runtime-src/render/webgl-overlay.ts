// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.

import { GOLD_TOKEN } from "../theme-fallback";
import { createColorResolver, type RGB } from "./colors";
import type { Renderer, RendererOptions, SampleOptions, Scene } from "./renderer";
import { BAND_FS, BAND_STRIP } from "./shaders/band";
import { BOX_FS, BOX_PAD, LABEL_FS, PILL_PAD } from "./shaders/box";
import { CARET_FS, CARET_PAD } from "./shaders/caret";
import { CURSOR_BOX, CURSOR_FS, CURSOR_PAD, CURSOR_TIP } from "./shaders/cursor";
import { QUAD_VS } from "./shaders/quad";
import { RIPPLE_FS, RIPPLE_REACH, RIPPLE_SECONDS } from "./shaders/ripple";
import { TRAIL_FS, TRAIL_MAX } from "./shaders/trail";
import { BADGE_STYLE, LABEL_STYLE, TextAtlas, type AtlasEntry } from "./text-atlas";
import { trimTrail } from "./trail";

type ProgramName = "cursor" | "trail" | "box" | "label" | "ripple" | "band" | "caret";

const FRAGMENTS: Record<ProgramName, string> = {
  cursor: CURSOR_FS,
  trail: TRAIL_FS,
  box: BOX_FS,
  label: LABEL_FS,
  ripple: RIPPLE_FS,
  band: BAND_FS,
  caret: CARET_FS,
};
interface Program {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation | null>;
}

interface PendingSample {
  opts: SampleOptions;
  frames: number;
  resolve: (count: number) => void;
}

/** Frames a sample waits for its caret or cursors before resolving 0 (about two seconds). */
const SAMPLE_PATIENCE = 120;

/**
 * The context the last overlay left behind, for the next one. WebKit counts a context lost with
 * `loseContext()` as active until it is garbage collected, so a new context per Replay makes it
 * warn and drop the oldest after about 16. Reusing one context keeps the page at one for the swarm.
 */
let kept: { canvas: HTMLCanvasElement; gl: WebGL2RenderingContext } | null = null;

/** Loses the context kept between swarms, if any. */
export function releaseKeptContext(): void {
  const k = kept;
  kept = null;
  if (k && !k.gl.isContextLost()) k.gl.getExtension("WEBGL_lose_context")?.loseContext();
}

/** The first length in a CSS border-radius, in px. */
const radiusPx = (radius: string) => parseFloat(radius) || 0;

/**
 * The swarm's one full-screen WebGL2 canvas: cursors, trails, drag boxes, badges, name tags,
 * ripples, reveal bands and typing carets, all from a plain-data Scene
 * each frame.
 */
export class WebGLOverlay implements Renderer {
  readonly canvas: HTMLCanvasElement;
  lost = false;
  disposed = false;
  private readonly gl: WebGL2RenderingContext;
  private readonly loseExt: WEBGL_lose_context | null;
  private readonly dpr: number;
  private readonly programs = new Map<ProgramName, Program>();
  private readonly buffer: WebGLBuffer;
  private readonly vao: WebGLVertexArrayObject;
  private readonly atlasTexture: WebGLTexture;
  private atlas: TextAtlas | null = null;
  private readonly color = createColorResolver();
  private readonly lastPos = new Map<string, { x: number; y: number; dx: number; dy: number }>();
  private samples: PendingSample[] = [];
  /** Trail points, reused every frame. */
  private readonly trailPoints = new Float32Array(TRAIL_MAX * 2);
  private readonly onLost = () => {
    this.lost = true;
    this.flushSamples();
  };

  /** Null when the browser has no WebGL2. */
  static create(opts: RendererOptions): WebGLOverlay | null {
    const reuse = kept;
    kept = null;
    if (reuse && !reuse.gl.isContextLost()) return new WebGLOverlay(reuse.canvas, reuse.gl, opts);
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) return null;
    return new WebGLOverlay(canvas, gl, opts);
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, { zIndex }: RendererOptions) {
    this.canvas = canvas;
    this.gl = gl;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.loseExt = gl.getExtension("WEBGL_lose_context");
    canvas.setAttribute("aria-hidden", "true");
    canvas.setAttribute("data-swarm-overlay", "");
    Object.assign(canvas.style, {
      position: "fixed",
      left: "0",
      top: "0",
      pointerEvents: "none",
      zIndex: String(zIndex),
    });
    // Composited normally (premultiplied source-over): the marks carry their own dark hairlines
    // and shadows, so they read on light pages as well as dark.
    canvas.style.removeProperty("mix-blend-mode");
    canvas.addEventListener("webglcontextlost", this.onLost);
    document.body.appendChild(canvas);

    try {
      for (const name of Object.keys(FRAGMENTS) as ProgramName[]) this.programs.set(name, this.link(FRAGMENTS[name]));
    } catch (error) {
      this.dispose();
      // A context whose shaders fail is not worth keeping.
      if (kept?.gl === gl) releaseKeptContext();
      throw error;
    }
    this.buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.atlasTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // Text waits for the page's fonts, and never starts once the overlay is gone.
    const fontsReady = document.fonts?.ready ?? Promise.resolve();
    fontsReady.then(() => {
      if (!this.disposed) this.atlas = TextAtlas.create(this.dpr);
    });
  }

  private link(fragment: string, vertex = QUAD_VS): Program {
    const { gl } = this;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`swarm-build: shader failed to compile: ${log}`);
      }
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, vertex);
    let fs: WebGLShader;
    try {
      fs = compile(gl.FRAGMENT_SHADER, fragment);
    } catch (error) {
      gl.deleteShader(vs);
      throw error;
    }
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, "aPos");
    gl.linkProgram(program);
    gl.detachShader(program, vs);
    gl.detachShader(program, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`swarm-build: shader program failed to link: ${log}`);
    }
    return { program, uniforms: new Map() };
  }

  private use(name: ProgramName, viewport: Scene["viewport"]): (uniform: string) => WebGLUniformLocation | null {
    const { gl } = this;
    const p = this.programs.get(name)!;
    gl.useProgram(p.program);
    const at = (uniform: string) => {
      if (!p.uniforms.has(uniform)) p.uniforms.set(uniform, gl.getUniformLocation(p.program, uniform));
      return p.uniforms.get(uniform)!;
    };
    gl.uniform2f(at("uViewport"), viewport.width, viewport.height);
    return at;
  }

  private quad(at: (u: string) => WebGLUniformLocation | null, x: number, y: number, w: number, h: number) {
    const { gl } = this;
    gl.uniform4f(at("uRect"), x, y, w, h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private rgb(at: (u: string) => WebGLUniformLocation | null, uniform: string, css: string) {
    const [r, g, b]: RGB = this.color(css);
    this.gl.uniform3f(at(uniform), r, g, b);
  }

  frame(scene: Scene): void {
    if (this.disposed || this.lost) return;
    const { gl, dpr } = this;
    const { viewport: vp } = scene;
    const width = Math.max(1, Math.round(vp.width * dpr));
    const height = Math.max(1, Math.round(vp.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      // The scene is in innerWidth × innerHeight pixels, scrollbar included, like the canvas.
      this.canvas.style.width = `${vp.width}px`;
      this.canvas.style.height = `${vp.height}px`;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindVertexArray(this.vao);
    const time = scene.time / 1000;
    const scale = scene.scale ?? 1;
    const atlas = this.atlas;
    // Text first, so a badge drawn into the atlas this frame is uploaded before it is used.
    const lookup = () => ({
      badgeText: scene.boxes.map((b) => (b.badge && atlas?.get(b.badge, BADGE_STYLE, scale)) || null),
      labelText: scene.labels.map((l) => atlas?.get(l.name, LABEL_STYLE, scale) ?? null),
    });
    const generation = atlas?.generation;
    let { badgeText, labelText } = lookup();
    // The atlas started over part-way: look everything up again in the fresh one.
    if (atlas && atlas.generation !== generation) ({ badgeText, labelText } = lookup());
    const upload = atlas?.takeUpload();
    if (upload) {
      gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
      if (upload.full) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas!.canvas);
      else gl.texSubImage2D(gl.TEXTURE_2D, 0, upload.x, upload.y, gl.RGBA, gl.UNSIGNED_BYTE, upload.pixels);
    }

    const gold = scene.accent ?? GOLD_TOKEN;
    if (scene.bands.length) {
      const at = this.use("band", vp);
      this.rgb(at, "uGold", gold);
      gl.uniform1f(at("uTime"), time);
      for (const b of scene.bands) {
        this.rgb(at, "uColor", b.color);
        gl.uniform1f(at("uFront"), b.frontY);
        gl.uniform1f(at("uTop"), b.top);
        gl.uniform1f(at("uE"), b.e);
        this.quad(at, b.left, b.frontY - BAND_STRIP, b.width, BAND_STRIP + 12);
      }
    }
    if (scene.ripples.length) {
      const at = this.use("ripple", vp);
      this.rgb(at, "uGold", gold);
      for (const r of scene.ripples) {
        // A spent ripple draws nothing, even if the scene still lists it.
        if (r.age >= RIPPLE_SECONDS) continue;
        this.rgb(at, "uColor", r.color);
        gl.uniform2f(at("uBlock"), r.width, r.height);
        gl.uniform1f(at("uRadius"), r.radius);
        gl.uniform1f(at("uAge"), r.age);
        const pad = RIPPLE_REACH + 12;
        this.quad(at, r.x - pad, r.y - pad, r.width + pad * 2, r.height + pad * 2);
      }
    }

    if (scene.boxes.length) {
      const at = this.use("box", vp);
      this.rgb(at, "uGold", gold);
      gl.uniform1f(at("uTime"), time);
      gl.uniform1f(at("uLine"), scale);
      const pad = BOX_PAD * scale;
      for (const b of scene.boxes) {
        if (b.width < 1 || b.height < 1) continue;
        this.rgb(at, "uColor", b.color);
        gl.uniform1f(at("uRadius"), radiusPx(b.radius));
        gl.uniform1f(at("uOpacity"), b.opacity);
        gl.uniform2f(at("uSize"), b.width, b.height);
        // Padded for the hairline's under-stroke.
        this.quad(at, b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
      }
    }
    if (scene.carets.length) {
      const at = this.use("caret", vp);
      this.rgb(at, "uGold", gold);
      gl.uniform1f(at("uTime"), time);
      for (const c of scene.carets) this.quad(at, c.x - CARET_PAD, c.y - CARET_PAD, CARET_PAD * 2, c.height + CARET_PAD * 2);
    }

    if (scene.trails.length) {
      const at = this.use("trail", vp);
      this.rgb(at, "uGold", gold);
      gl.uniform1f(at("uWidth"), scale);
      const pts = this.trailPoints;
      for (const t of scene.trails) {
        const kept = trimTrail(t.points);
        const n = kept.length;
        if (n < 2) continue;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i < n; i++) {
          const p = kept[i];
          pts[i * 2] = p.x;
          pts[i * 2 + 1] = p.y;
          x0 = Math.min(x0, p.x);
          y0 = Math.min(y0, p.y);
          x1 = Math.max(x1, p.x);
          y1 = Math.max(y1, p.y);
        }
        if (x1 - x0 < 0.5 && y1 - y0 < 0.5) continue;
        this.rgb(at, "uColor", t.color);
        gl.uniform2fv(at("uPts"), pts);
        gl.uniform1i(at("uCount"), n);
        const pad = 12 * scale;
        this.quad(at, x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2);
      }
    }

    if (scene.boxes.some((b) => b.badge)) this.drawBadges(scene, badgeText);
    if (scene.cursors.length) {
      const at = this.use("cursor", vp);
      gl.uniform1f(at("uTime"), time);
      for (const c of scene.cursors) {
        const last = this.lastPos.get(c.name);
        const dx = last ? c.x - last.x : 0;
        const dy = last ? c.y - last.y : 0;
        // Keep the last heading while the cursor rests, so its sheen does not snap back.
        const moving = Math.hypot(dx, dy) > 0.25;
        const dir = moving ? { dx, dy } : (last ?? { dx: 0, dy: 0 });
        this.lastPos.set(c.name, { x: c.x, y: c.y, dx: dir.dx, dy: dir.dy });
        this.rgb(at, "uColor", c.color);
        gl.uniform1f(at("uScale"), c.scale);
        gl.uniform2f(at("uDir"), dir.dx, dir.dy);
        const pad = CURSOR_PAD * c.scale;
        this.quad(at, c.x - pad, c.y - pad, CURSOR_BOX.width * c.scale, CURSOR_BOX.height * c.scale);
      }
    }
    if (scene.labels.length) {
      const at = this.use("label", vp);
      gl.uniform1f(at("uTime"), time);
      for (const [i, l] of scene.labels.entries()) {
        const text = labelText[i];
        const width = text ? text.width + 16 * scale : l.width;
        const x = l.flip ? l.x + l.width - width : l.x;
        this.pill(at, x, l.y, width, l.height, 999, l.color, l.text, l.opacity ?? 1, text, 8 * scale, 2 * scale, scale);
      }
    }
    this.flushSamples(scene);
  }

  private drawBadges(scene: Scene, texts: (AtlasEntry | null)[]) {
    const at = this.use("label", scene.viewport);
    this.gl.uniform1f(at("uTime"), scene.time / 1000);
    const scale = scene.scale ?? 1;
    for (const [i, b] of scene.boxes.entries()) {
      if (!b.badge) continue;
      const text = texts[i];
      const width = (text ? text.width : b.badge.length * 5.6 * scale) + 8 * scale;
      const height = 16 * scale;
      // Centred under the box, or inside its bottom edge near the screen's bottom (swarm-build.js:301).
      const x = b.x + b.width / 2 - width / 2;
      const gap = 4 * scale;
      const y = b.badgeInside ? b.y + b.height - gap - height : b.y + b.height + gap;
      this.pill(at, x, y, width, height, 3 * scale, b.color, b.text, b.opacity, text, 4 * scale, 1 * scale, scale);
    }
  }

  private pill(
    at: (u: string) => WebGLUniformLocation | null,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    color: string,
    textColor: string,
    opacity: number,
    text: AtlasEntry | null,
    padX: number,
    padY: number,
    scale: number,
  ) {
    const { gl, dpr } = this;
    // On whole device pixels, so the atlas text maps texel for texel and stays crisp.
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    x = snap(x);
    y = snap(y);
    width = snap(width);
    height = snap(height);
    padX = snap(padX);
    padY = snap(padY);
    const pad = snap(PILL_PAD * scale);
    gl.uniform1f(at("uScale"), scale);
    gl.uniform1f(at("uPad"), pad);
    this.rgb(at, "uColor", color);
    this.rgb(at, "uTextColor", textColor);
    gl.uniform2f(at("uSize"), width, height);
    gl.uniform1f(at("uRadius"), radius);
    gl.uniform1f(at("uOpacity"), opacity);
    gl.uniform1f(at("uHasText"), text ? 1 : 0);
    if (text) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
      gl.uniform1i(at("uAtlas"), 0);
      gl.uniform4f(at("uUV"), ...text.uv);
      gl.uniform4f(at("uText"), padX, padY, text.width, text.height);
    }
    this.quad(at, x - pad, y - pad, width + pad * 2, height + pad * 2);
  }

  sample(opts: SampleOptions = {}): Promise<number> {
    if (this.disposed || this.lost) return Promise.resolve(0);
    return new Promise((resolve) => this.samples.push({ opts, frames: 0, resolve }));
  }

  /** Reads pending samples from the frame just drawn; without a scene, resolves them all to 0. */
  private flushSamples(scene?: Scene) {
    if (!this.samples.length) return;
    if (!scene) {
      this.samples.splice(0).forEach((s) => s.resolve(0));
      return;
    }
    this.samples = this.samples.filter((s) => {
      const squares = this.squares(scene, s.opts);
      if (!squares.length && ++s.frames < SAMPLE_PATIENCE) return true;
      s.resolve(squares.reduce((sum, sq) => sum + this.countOpaque(sq), 0));
      return false;
    });
  }

  private squares(scene: Scene, { around, radius = 24 }: SampleOptions) {
    const { width, height } = scene.viewport;
    if (!around) return [{ x: 0, y: 0, w: width, h: height }];
    const centres =
      around === "caret"
        ? scene.carets.map((c) => ({ x: c.x, y: c.y + c.height / 2 }))
        : scene.cursors.map((c) => ({ x: c.x + CURSOR_TIP.x * c.scale + 6, y: c.y + CURSOR_TIP.y * c.scale + 8 }));
    return centres
      .map((c) => {
        const x = Math.max(0, c.x - radius);
        const y = Math.max(0, c.y - radius);
        return { x, y, w: Math.min(width, c.x + radius) - x, h: Math.min(height, c.y + radius) - y };
      })
      .filter((sq) => sq.w > 0 && sq.h > 0);
  }

  private countOpaque({ x, y, w, h }: { x: number; y: number; w: number; h: number }): number {
    const { gl, dpr } = this;
    const px = Math.floor(x * dpr);
    const pw = Math.max(1, Math.round(w * dpr));
    const ph = Math.max(1, Math.round(h * dpr));
    const py = this.canvas.height - Math.floor(y * dpr) - ph;
    const data = new Uint8Array(pw * ph * 4);
    gl.readPixels(px, Math.max(0, py), pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, data);
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count++;
    return count;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const { gl } = this;
    this.flushSamples();
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    for (const { program } of this.programs.values()) gl.deleteProgram(program);
    this.programs.clear();
    if (this.atlasTexture) gl.deleteTexture(this.atlasTexture);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.vao) gl.deleteVertexArray(this.vao);
    this.atlas?.dispose();
    this.atlas = null;
    this.canvas.remove();
    if (gl.isContextLost()) return;
    // Keep the context for the next swarm, at the smallest size; a second one is lost.
    if (kept) {
      this.loseExt?.loseContext();
    } else {
      this.canvas.width = this.canvas.height = 1;
      kept = { canvas: this.canvas, gl };
    }
  }
}
