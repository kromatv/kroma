// Legacy-engine CSS compat (old webOS: Chromium 53-94). A PostCSS plugin that
// rewrites the modern CSS the design system emits into equivalents those
// engines execute:
//
//  - flex `gap` (Chrome 84) -> a one-class rule keeps its gap and gains a
//    marker the runtime shim (flex-gaps.ts) lays out by flex direction, which
//    a stylesheet cannot know. Any other selector gets the negative-margin
//    technique: the container pulls -gap/2 per axis, every child pushes +gap/2.
//  - `aspect-ratio` (Chrome 88) -> a `::before` strut with percentage
//    padding-bottom (resolves against width), which also centres in-flow
//    children of flex tiles the way aspect-ratio does.
//  - bare `display: grid` is dropped, since Chromium 53 ignores it anyway.
//  - an absolutely positioned `<button>` pinned by opposite zero insets gets an
//    explicit 100% size: before Chromium 88 a button's auto width fits its
//    content even with `left` and `right` both set, so a pressable laid over a
//    picture (the player stage, an up-next card) came out zero wide.

import { type Declaration, type Plugin, type Root, type Rule, rule as cssRule } from 'postcss';
import { GAP_MARKER } from './gap-marker.ts';

const RATIO = /(?=(\d+(?:\.\d+)?))\1\s*\/\s*(\d+(?:\.\d+)?)/;

// Split a CSS value on top-level whitespace (never inside parentheses).
function splitSpace(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of value.trim()) {
    if (ch === '(') {
      depth += 1;
    }
    if (ch === ')') {
      depth -= 1;
    }
    if (/\s/.test(ch) && depth === 0) {
      if (cur) {
        parts.push(cur);
      }
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) {
    parts.push(cur);
  }
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
    if (RATIO.test(d.value)) {
      map.set(d.prop, d.value);
    }
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
    if (rule?.type !== 'rule') {
      continue;
    }
    let raw = decl.value.trim();
    const viaVar = /^var\((--[\w-]+)\)$/.exec(raw);
    if (viaVar) {
      raw = ratios.get(viaVar[1] ?? '') ?? raw;
    }
    const m = RATIO.exec(raw) ?? (/^\d+(?:\.\d+)?$/.test(raw) ? [raw, raw, '1'] : null);
    if (!m) {
      continue;
    } // unresolvable ratio: leave it (the compat check will flag it)
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
    if (rule.nodes.length === 0) {
      rule.remove();
    }
  }
}

const ONE_CLASS = /^\.[\w-]+$/;

// The marker matches nothing, and its one declaration keeps a minifier from
// dropping it.
function markGap(rule: Rule, row: string, column: string): void {
  const marker = rule.cloneAfter({
    selectors: [`${rule.selector}[${GAP_MARKER}="${row}|${column}"]`],
  });
  marker.removeAll();
  marker.append({ prop: 'order', value: '0' });
}

type Margins = Array<{ prop: string; value: string }>;

function marginsFor(prop: string, rowV: string, colV: string): [Margins, Margins] {
  const container: Margins = [];
  const child: Margins = [];
  const axes = [
    { skip: 'column-gap', value: rowV, sides: ['top', 'bottom'] },
    { skip: 'row-gap', value: colV, sides: ['left', 'right'] },
  ];
  for (const { skip, value, sides } of axes) {
    if (prop === skip) {
      continue;
    }
    for (const side of sides) {
      container.push({ prop: `margin-${side}`, value: half(value, '-') });
      child.push({ prop: `margin-${side}`, value: half(value, '') });
    }
  }
  return [container, child];
}

// flex `gap` on any other selector -> container -gap/2 margins + a `S > *`
// child rule with +gap/2.
function marginGap(rule: Rule, decl: Declaration, [rowV, colV]: [string, string]): void {
  const [container, child] = marginsFor(decl.prop, rowV, colV);
  const childRule = rule.cloneAfter({
    selectors: rule.selectors.map((s) => `${s} > *`),
  });
  childRule.removeAll();
  childRule.append(...child);
  decl.replaceWith(...container);
}

function shimGap(root: Root): void {
  const decls: Declaration[] = [];
  root.walkDecls(/^(gap|column-gap|row-gap)$/, (d) => {
    decls.push(d);
  });
  for (const decl of decls) {
    const rule = decl.parent;
    if (rule?.type !== 'rule') {
      continue;
    }
    const parts = splitSpace(decl.value);
    const rowV = parts[0] ?? decl.value;
    const colV = decl.prop === 'gap' ? (parts[1] ?? rowV) : rowV;
    if (ONE_CLASS.test(rule.selector)) {
      markGap(rule, decl.prop === 'column-gap' ? '' : rowV, decl.prop === 'row-gap' ? '' : colV);
    } else {
      marginGap(rule, decl, [rowV, colV]);
    }
  }
}

// Drop bare `display: grid|inline-grid`. Chromium 53 ignores the declaration
// anyway (the element stays block), so removing it just makes the 87/94 legacy
// engines behave identically. Real grid LAYOUTS (grid-template*, grid-column,
// ...) are not silently fixed - the compat check fails the build.
function stripGridDisplay(root: Root): void {
  const decls: Declaration[] = [];
  root.walkDecls('display', (d) => {
    if (/^(inline-)?grid$/.test(d.value.trim())) {
      decls.push(d);
    }
  });
  for (const d of decls) {
    const rule = d.parent;
    d.remove();
    if (rule?.nodes.length === 0) {
      rule.remove();
    }
  }
}

const ATOMIC = /^\.([\w-]+)$/;
const ZERO = /^0(px|%)?$/;

function atomicClasses(root: Root): Map<string, string[]> {
  const byDecl = new Map<string, string[]>();
  root.walkRules((r: Rule) => {
    const cls = ATOMIC.exec(r.selector);
    const only = r.nodes.length === 1 ? r.nodes[0] : undefined;
    if (!cls?.[1] || only?.type !== 'decl') {
      return;
    }
    const value = only.value.trim();
    let key: string | null = null;
    if (only.prop === 'position') {
      key = `position:${value}`;
    } else if (ZERO.test(value)) {
      key = `${only.prop}:0`;
    }
    if (!key) {
      return;
    }
    byDecl.set(key, [...(byDecl.get(key) ?? []), cls[1]]);
  });
  return byDecl;
}

function stretchPinnedButtons(root: Root): void {
  const byDecl = atomicClasses(root);
  const absolute = byDecl.get('position:absolute') ?? [];
  const axes = [
    { from: 'left:0', to: 'right:0', size: 'width' },
    { from: 'top:0', to: 'bottom:0', size: 'height' },
  ];
  for (const { from, to, size } of axes) {
    const selectors: string[] = [];
    for (const a of absolute) {
      for (const start of byDecl.get(from) ?? []) {
        for (const end of byDecl.get(to) ?? []) {
          selectors.push(`button.${a}.${start}.${end}`);
        }
      }
    }
    if (selectors.length === 0) {
      continue;
    }
    root.append(cssRule({ selectors }).append({ prop: size, value: '100%' }));
  }
}

export function kromaLegacyCss(): Plugin {
  return {
    postcssPlugin: 'kroma-legacy-css',
    Once(root) {
      stretchPinnedButtons(root);
      stripGridDisplay(root);
      shimAspect(root, collectRatioVars(root));
      shimGap(root);
    },
  };
}
