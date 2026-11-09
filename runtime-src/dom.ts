// SPDX-License-Identifier: MIT
// Ported from swarm-build (https://github.com/habom2310/swarm-build), Copyright (c) 2026 Ha Nguyen
// Copyright (c) 2026 swarm-build-canvas contributors and 53able. See LICENSE.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style: Partial<CSSStyleDeclaration> = {},
  parent?: Element,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  parent?.appendChild(node);
  return node;
}

export function imageSource(node: Element): string {
  if (node instanceof HTMLImageElement) return node.currentSrc || node.src;
  return getComputedStyle(node).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1] ?? "";
}

/** Plain text a block can type in, or null when it holds elements or too much text. */
export function typeable(node: Element): string | null {
  if (![...node.childNodes].every((n) => n.nodeType === Node.TEXT_NODE)) return null;
  const text = node.textContent ?? "";
  return text.trim().length > 0 && text.length <= 240 ? text : null;
}
