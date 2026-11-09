"use client";

import type { CSSProperties } from "react";
import { LiquidObject } from "./LiquidObject";

export interface CanvasUiEffectProps {
  /** Site-owned image, SVG or model URL. */
  src: string;
  /** Empty string preserves the asset's original colors. */
  tint?: string;
  className?: string;
  /** Provide a sized slot, for example { width: "100%", height: 320 }. */
  style: CSSProperties;
}

/** Mount in a sized, local slot in an existing React 19 application. */
export function CanvasUiEffect({ src, tint = "", className, style }: CanvasUiEffectProps) {
  return <LiquidObject src={src} tint={tint} className={className} style={style} />;
}
