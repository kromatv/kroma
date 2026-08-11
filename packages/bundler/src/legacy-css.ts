// Legacy-engine CSS compat (old webOS: Chromium 53-94). A PostCSS plugin that
// rewrites the modern CSS the design system emits into equivalents those
// engines execute:
//
//  - flex `gap` (Chrome 84) -> the negative-margin technique: the container
//    pulls -gap/2 per axis, every child pushes +gap/2, so spacing, wrapping and
//    edge alignment all match real gap.
//  - `aspect-ratio` (Chrome 88) -> a `::before` strut with percentage
//    padding-bottom (resolves against width), which also centres in-flow
//    children of flex tiles the way aspect-ratio does.
//  - bare `display: grid` is dropped, since Chromium 53 ignores it anyway.

import type { Declaration, Plugin, Root } from 'postcss';

const RATIO = /(?=(\d+(?:\.\d+)?))\1\s*\/\s*(\d+(?:\.\d+)?)/;

// Split a CSS value on top-level whitespace (never inside parentheses).
function splitSpace(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of value.trim()) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

// Half of a CSS length as a calc(), sign '' (positive) or '-' (negative).
function half(value: string, sign: '' | '-'): string {
  const inner = value.startsWith('calc(') && value.endsWith(')') ? value.slice(5, -1) : value;
  return `calc((${inner}) * ${sign}.5)`;
}

// All `--aspect-*`-style custom properties whose value is a `W / H` ratio.
function collectRatioVars(root: Root): Map<string, string> {
  const map = new Map<string, string>();
  root.walkDecls(/^--/, (d) => {
    if (RATIO.test(d.value)) map.set(d.prop, d.value);
  });
  return map;
}

// `aspect-ratio: W/H` -> `S::before { padding-bottom: H/W% }` strut.
function shimAspect(root: Root, ratios: Map<string, string>): void {
  const decls: Declaration[] = [];
  root.walkDecls('aspect-ratio', (d) => {
    decls.push(d);
  });
  for (const decl of decls) {
    const rule = decl.parent;
    if (rule?.type !== 'rule') continue;
    let raw = decl.value.trim();
    const viaVar = /^var\((--[\w-]+)\)$/.exec(raw);
    if (viaVar) raw = ratios.get(viaVar[1] ?? '') ?? raw;
    const m = RATIO.exec(raw) ?? (/^\d+(?:\.\d+)?$/.test(raw) ? [raw, raw, '1'] : null);
    if (!m) continue; // unresolvable ratio: leave it (the compat check will flag it)
    const pct = Math.round((Number(m[2]) / Number(m[1])) * 10000) / 100;
    const strut = rule.cloneAfter({
      selectors: rule.selectors.map((s) => `${s}::before`),
    });
    strut.removeAll();
    strut.append(
      { prop: 'content', value: '""' },
      { prop: 'display', value: 'block' },
      { prop: 'padding-bottom', value: `${pct}%` },
    );
    decl.remove();
    if (rule.nodes.length === 0) rule.remove();
  }
}

// flex `gap` -> container -gap/2 margins + a `S > *` child rule with +gap/2.
function shimGap(root: Root): void {
  const decls: Declaration[] = [];
  root.walkDecls(/^(gap|column-gap|row-gap)$/, (d) => {
    decls.push(d);
  });
  for (const decl of decls) {
    const rule = decl.parent;
    if (rule?.type !== 'rule') continue;
    const parts = splitSpace(decl.value);
    const rowV = parts[0] ?? decl.value;
    const colV = decl.prop === 'gap' ? (parts[1] ?? rowV) : rowV;
    const container: Array<{ prop: string; value: string }> = [];
    const child: Array<{ prop: string; value: string }> = [];
    if (decl.prop !== 'column-gap') {
      container.push(
        { prop: 'margin-top', value: half(rowV, '-') },
        { prop: 'margin-bottom', value: half(rowV, '-') },
      );
      child.push(
        { prop: 'margin-top', value: half(rowV, '') },
        { prop: 'margin-bottom', value: half(rowV, '') },
      );
    }
    if (decl.prop !== 'row-gap') {
      container.push(
        { prop: 'margin-left', value: half(colV, '-') },
        { prop: 'margin-right', value: half(colV, '-') },
      );
      child.push(
        { prop: 'margin-left', value: half(colV, '') },
        { prop: 'margin-right', value: half(colV, '') },
      );
    }
    const childRule = rule.cloneAfter({
      selectors: rule.selectors.map((s) => `${s} > *`),
    });
    childRule.removeAll();
    childRule.append(...child);
    decl.replaceWith(...container);
  }
}

// Drop bare `display: grid|inline-grid`. Chromium 53 ignores the declaration
// anyway (the element stays block), so removing it just makes the 87/94 legacy
// engines behave identically. Real grid LAYOUTS (grid-template*, grid-column,
// ...) are not silently fixed - the compat check fails the build.
function stripGridDisplay(root: Root): void {
  const decls: Declaration[] = [];
  root.walkDecls('display', (d) => {
    if (/^(inline-)?grid$/.test(d.value.trim())) decls.push(d);
  });
  for (const d of decls) {
    const rule = d.parent;
    d.remove();
    if (rule?.nodes.length === 0) rule.remove();
  }
}

export function kromaLegacyCss(): Plugin {
  return {
    postcssPlugin: 'kroma-legacy-css',
    Once(root) {
      stripGridDisplay(root);
      shimAspect(root, collectRatioVars(root));
      shimGap(root);
    },
  };
}
