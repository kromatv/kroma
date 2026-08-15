import type { Measured } from './views';

/** `[nodes, depth, commits]`: what one story view is allowed to cost - its
 * elements, how deep they nest, and how many React commits its mount takes. */
type Allowance = readonly [nodes: number, depth: number, commits: number];

type Budget = Record<string, Allowance>;

interface Verdict {
  key: string;
  line: string;
}

/** How one measured view is named in `budget.json`, and the only spelling of it. */
function keyOf(entry: Measured): string {
  return `${entry.id}/${entry.view}`;
}

/** The budget these measurements would write: the ratchet's next position. */
function budgetOf(measured: readonly Measured[]): Budget {
  const out: Budget = {};
  for (const entry of measured) {
    out[keyOf(entry)] = [entry.cost.nodes, entry.cost.depth, entry.work.commits];
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

/** One line per view whose cost no longer matches its allowance, in both
 * directions: a view that grew is a regression, and one that shrank leaves a
 * budget that no longer holds anything to account. */
function drift(measured: readonly Measured[], budget: Budget): readonly Verdict[] {
  const out: Verdict[] = [];
  const seen = new Set<string>();
  for (const entry of measured) {
    const key = keyOf(entry);
    seen.add(key);
    if (entry.error) {
      out.push({ key, line: `${key}: no longer renders - ${entry.error}` });
      continue;
    }
    const allowed = budget[key];
    if (!allowed) {
      out.push({ key, line: `${key}: not budgeted (${entry.cost.nodes} nodes)` });
      continue;
    }
    const [nodes, depth, commits] = allowed;
    const now = `${entry.cost.nodes} nodes / depth ${entry.cost.depth} / ${entry.work.commits} commits`;
    const held = `${nodes} / ${depth} / ${commits}`;
    if (entry.cost.nodes > nodes || entry.cost.depth > depth || entry.work.commits > commits) {
      out.push({ key, line: `${key}: grew to ${now}, budget is ${held}` });
      continue;
    }
    if (entry.cost.nodes < nodes || entry.cost.depth < depth || entry.work.commits < commits) {
      out.push({ key, line: `${key}: down to ${now}, budget still says ${held} - tighten it` });
    }
  }
  for (const key of Object.keys(budget)) {
    if (!seen.has(key)) out.push({ key, line: `${key}: budgeted but no such view any more` });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/** The file as it is committed: one line per view, so a diff reads as a list of
 * components that moved. */
function serialize(budget: Budget): string {
  const lines = Object.entries(budget).map(
    ([key, [nodes, depth, commits]]) =>
      `  ${JSON.stringify(key)}: [${nodes}, ${depth}, ${commits}]`,
  );
  return `{\n${lines.join(',\n')}\n}\n`;
}

export type { Budget };
export { budgetOf, drift, keyOf, serialize };
