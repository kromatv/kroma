import type { CompiledRule } from './compile.ts';

// Not `localeCompare`: this order ends up in a shipped stylesheet, so it must
// be the same on every machine rather than follow the build's locale.
function byCodeUnit(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** A rule with its group, in the shape the dev runtime injects. */
export type RuleEntry = readonly [group: number, css: string];

/**
 * Every rule a build compiled, once each, in the order the sheet paints them:
 * by group, then by text, so two builds of the same source write the same
 * bytes whatever order the modules were transformed in.
 */
export class RuleSheet {
  private readonly groups = new Map<string, number>();

  add(rules: readonly CompiledRule[]): void {
    for (const rule of rules) {
      if (!this.groups.has(rule.css)) this.groups.set(rule.css, rule.group);
    }
  }

  get size(): number {
    return this.groups.size;
  }

  entries(): RuleEntry[] {
    return [...this.groups.entries()]
      .map(([css, group]): RuleEntry => [group, css])
      .sort((a, b) => a[0] - b[0] || byCodeUnit(a[1], b[1]));
  }

  toCss(): string {
    return this.entries()
      .map(([, css]) => css)
      .join('\n');
  }
}
