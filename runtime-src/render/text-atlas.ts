// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.

/** One string drawn into the atlas. Sizes are CSS px; `uv` is (u0, v0, u1, v1). */
export interface AtlasEntry {
  width: number;
  height: number;
  uv: [number, number, number, number];
}

export interface TextStyle {
  /** A canvas font, without line height. */
  font: string;
  /** The line box height in CSS px; the text is centred in it. */
  lineHeight: number;
}

/** Name tags: 600 11px/16px (swarm-build.js:196). */
export const LABEL_STYLE: TextStyle = { font: "600 11px system-ui, sans-serif", lineHeight: 16 };
/** "W × H" badges: 500 10px/14px with tabular numbers (swarm-build.js:286). */
export const BADGE_STYLE: TextStyle = { font: "500 10px system-ui, sans-serif", lineHeight: 14 };

const SIZE = 1024;
const GAP = 2;

/** What the overlay must upload: the whole canvas, or the part drawn since the last upload. */
export type AtlasUpload = { full: true } | { full: false; x: number; y: number; pixels: ImageData };

/**
 * Strings rendered once into a 2D canvas, white on transparent, for the overlay to upload as one
 * texture. Labels are drawn once per agent; a badge only when its text changes. When the canvas
 * fills up it starts over, and the strings still in use are drawn again on the next frame.
 * After the first upload only the newly drawn strings are uploaded (`takeUpload`): a drag adds a
 * badge every frame, and re-sending the whole 1024² canvas for it was the overlay's main cost.
 */
export class TextAtlas {
  readonly canvas: HTMLCanvasElement;
  /** Goes up each time the atlas starts over, which invalidates every entry handed out before. */
  generation = 0;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly entries = new Map<string, AtlasEntry>();
  private x = 0;
  private y = 0;
  private row = 0;
  /** The whole canvas needs uploading: nothing was uploaded yet, or it started over. */
  private full = true;
  /** Device-pixel bounds drawn since the last upload, or null. */
  private drawn: { x0: number; y0: number; x1: number; y1: number } | null = null;

  private constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, private readonly dpr: number) {
    this.canvas = canvas;
    this.ctx = ctx;
  }

  /** Null when the browser has no 2D canvas. */
  static create(dpr: number): TextAtlas | null {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    // Read back on every partial upload: keep the canvas in CPU memory.
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    return ctx ? new TextAtlas(canvas, ctx, dpr) : null;
  }

  get size(): number {
    return this.entries.size;
  }

  /**
   * The entry for `text` in `style`, drawn `scale` times as large: at scale × the device pixel
   * ratio, so a larger tag stays as crisp as a scale-1 one. Its size is in CSS px at that scale.
   */
  get(text: string, style: TextStyle, scale = 1): AtlasEntry {
    const key = `${style.font}|${scale}|${text}`;
    const hit = this.entries.get(key);
    if (hit) return hit;
    const { ctx } = this;
    const dpr = this.dpr * scale;
    ctx.font = style.font;
    const base = ctx.measureText(text).width;
    const width = Math.ceil(base * scale);
    const lineHeight = style.lineHeight * scale;
    const w = Math.ceil(width * this.dpr) + GAP;
    const h = Math.ceil(lineHeight * this.dpr) + GAP;
    if (this.x + w > SIZE) {
      this.x = 0;
      this.y += this.row;
      this.row = 0;
    }
    if (this.y + h > SIZE) this.reset();
    const px = this.x;
    const py = this.y;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, px, py);
    ctx.font = style.font;
    ctx.fillStyle = "white";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 0, style.lineHeight / 2);
    ctx.restore();
    this.x += w;
    this.row = Math.max(this.row, h);
    const d = this.drawn;
    this.drawn = d
      ? { x0: Math.min(d.x0, px), y0: Math.min(d.y0, py), x1: Math.max(d.x1, px + w), y1: Math.max(d.y1, py + h) }
      : { x0: px, y0: py, x1: px + w, y1: py + h };
    const entry: AtlasEntry = {
      width,
      height: lineHeight,
      uv: [px / SIZE, py / SIZE, (px + width * this.dpr) / SIZE, (py + lineHeight * this.dpr) / SIZE],
    };
    this.entries.set(key, entry);
    return entry;
  }

  /** What changed since the last call, for the overlay to upload; null when nothing did. */
  takeUpload(): AtlasUpload | null {
    const d = this.drawn;
    this.drawn = null;
    if (this.full) {
      this.full = false;
      return { full: true };
    }
    if (!d) return null;
    const x1 = Math.min(d.x1, SIZE);
    const y1 = Math.min(d.y1, SIZE);
    return { full: false, x: d.x0, y: d.y0, pixels: this.ctx.getImageData(d.x0, d.y0, x1 - d.x0, y1 - d.y0) };
  }

  private reset(): void {
    this.generation++;
    this.full = true;
    this.drawn = null;
    this.ctx.clearRect(0, 0, SIZE, SIZE);
    this.entries.clear();
    this.x = 0;
    this.y = 0;
    this.row = 0;
  }

  dispose(): void {
    this.entries.clear();
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}
