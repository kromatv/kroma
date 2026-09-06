// The dev server's stylesheet: a build writes every compiled rule into the
// static sheet, a dev server has no such sheet and each module inserts its own
// rules as it loads, into the renderer's own ordered sheet. A rule holds the
// place its priority group gives it, and a class the renderer registers later
// inserts nothing twice.

import { StyleSheet } from 'react-native';

/** A rule and the priority group it belongs to; lower groups paint first. */
export type RuleEntry = readonly [group: number, css: string];

interface OrderedSheet {
  insertStatic?: (css: string, group: number) => void;
}

export function injectRules(entries: readonly RuleEntry[]): void {
  const insert = (StyleSheet as OrderedSheet).insertStatic;
  if (!insert) return;
  for (const [group, css] of entries) insert(css, group);
}
