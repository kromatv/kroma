import type { A11yKind } from './a11y';
import { factsOf, type SmellKind } from './cost';
import type { Measured } from './views';

const KINDS: readonly SmellKind[] = [
  'passthrough',
  'wrapper',
  'glyph-wrapper',
  'void',
  'hidden-subtree',
];

interface Totals {
  views: number;
  nodes: number;
  leaves: number;
  overhead: number;
  smells: Record<SmellKind, number>;
}

function totalsOf(measured: readonly Measured[]): Totals {
  const smells = Object.fromEntries(KINDS.map((kind) => [kind, 0])) as Record<SmellKind, number>;
  let nodes = 0;
  let leaves = 0;
  for (const entry of measured) {
    nodes += entry.cost.nodes;
    leaves += entry.cost.leaves;
    for (const smell of entry.cost.smells) smells[smell.kind] += 1;
  }
  return { views: measured.length, nodes, leaves, overhead: nodes - leaves, smells };
}

function ratio(entry: Measured): number {
  return entry.cost.leaves === 0 ? entry.cost.nodes : entry.cost.nodes / entry.cost.leaves;
}

/** The worklist's order: the views carrying the most structure, worst first. */
function worstFirst(measured: readonly Measured[], limit: number): readonly Measured[] {
  return [...measured].sort((a, b) => b.cost.overhead - a.cost.overhead).slice(0, limit);
}

function row(entry: Measured): string {
  const smells = KINDS.map(
    (kind) => entry.cost.smells.filter((smell) => smell.kind === kind).length,
  ).join(' / ');
  return `| ${entry.name} | ${entry.view} | ${entry.cost.nodes} | ${entry.cost.leaves} | ${entry.cost.overhead} | ${ratio(entry).toFixed(1)} | ${entry.cost.depth} | ${smells} |`;
}

const HEAD = [
  '| Component | View | Nodes | Leaves | Overhead | N/L | Depth | pass / wrap / glyph / void / hidden |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
].join('\n');

/** The worklist: every view, worst structural overhead first, with the smells
 * that explain it. Written for a person picking the next component to work on. */
function worklist(measured: readonly Measured[], limit: number): readonly string[] {
  const totals = totalsOf(measured);
  const worst = worstFirst(measured, limit);
  return [
    '# Kit DOM audit',
    '',
    `${totals.views} views · ${totals.nodes} nodes · ${totals.leaves} leaves · ${totals.overhead} structural`,
    '',
    ...KINDS.map((kind) => `- ${kind}: ${totals.smells[kind]}`),
    '',
    `## Worst ${worst.length} by structural overhead`,
    '',
    HEAD,
    ...worst.map(row),
  ];
}

function smellsOf(measured: readonly Measured[]): readonly string[] {
  const noisiest = [...measured].sort((a, b) => b.cost.smells.length - a.cost.smells.length);
  return noisiest.flatMap((entry) =>
    entry.cost.smells.length === 0
      ? []
      : [
          `### ${entry.name} / ${entry.view}  (${entry.file})`,
          ...entry.cost.smells.flatMap((smell) => [
            `- \`${smell.kind}\` ${smell.note}`,
            `  \`${smell.at}\``,
          ]),
          '',
        ],
  );
}

function report(measured: readonly Measured[], limit = 40): string {
  const broken = measured.filter((entry) => entry.error);
  const out = [...worklist(measured, limit), '', '## Smells', '', ...smellsOf(measured)];
  const failing = measured.filter((entry) => entry.access.findings.length > 0);
  if (failing.length > 0) {
    out.push('## Accessibility', '');
    const tally = new Map<A11yKind, number>();
    for (const entry of failing) {
      for (const finding of entry.access.findings) {
        tally.set(finding.kind, (tally.get(finding.kind) ?? 0) + 1);
      }
    }
    for (const [kind, count] of [...tally].sort((a, b) => b[1] - a[1])) {
      out.push(`- ${kind}: ${count}`);
    }
    out.push('');
    for (const entry of failing) {
      out.push(`### ${entry.name} / ${entry.view}  (${entry.file})`);
      for (const finding of entry.access.findings) {
        out.push(`- \`${finding.kind}\` ${finding.note}`, `  \`${finding.at}\``);
      }
      out.push('');
    }
  }
  if (broken.length > 0) {
    out.push('## Did not render', '', ...broken.map((e) => `- ${e.name} / ${e.view}: ${e.error}`));
  }
  return `${out.join('\n')}\n`;
}

/** The stdout digest: the same worklist, minus the per-node detail. */
function digest(measured: readonly Measured[], limit = 15): string {
  const totals = totalsOf(measured);
  const worst = worstFirst(measured, limit);
  const smells = KINDS.filter((kind) => totals.smells[kind] > 0)
    .map((kind) => `${kind} ${totals.smells[kind]}`)
    .join(', ');
  const a11y = measured.reduce((sum, entry) => sum + entry.access.findings.length, 0);
  const restless = measured.filter((entry) => entry.work.commits > 1);
  const worstMounts = [...restless]
    .sort((a, b) => b.work.commits - a.work.commits)
    .slice(0, 8)
    .map(
      (entry) =>
        `  ${entry.work.commits} commits${entry.work.remounts ? ' (full re-render)' : ''}  ${entry.name} / ${entry.view}`,
    );
  // The three summary lines lead, in this order, because they are what `--quiet`
  // reads and what a person wants first: the size, then whether anything is
  // wrong with it, then what there is to remove.
  return [
    `${totals.views} views  ${totals.nodes} nodes  ${totals.leaves} leaves  ${totals.overhead} structural`,
    a11y === 0 ? 'a11y: clean' : `a11y: ${a11y} findings`,
    restless.length === 0
      ? 'mounts: all settle in one commit'
      : `mounts: ${restless.length} views need more than one commit`,
    smells,
    ...worstMounts,
    '',
    ...worst.map(
      (entry) =>
        `${String(entry.cost.overhead).padStart(4)}  ${String(entry.cost.nodes).padStart(4)}n  d${entry.cost.depth}  ${entry.name} / ${entry.view}`,
    ),
  ].join('\n');
}

function label(el: Element): string {
  const facts = factsOf(el);
  const marks = [
    facts.paints ? 'paints' : '',
    facts.hidden ? 'hidden' : '',
    facts.ownText ? 'text' : '',
    facts.semantic.join(','),
    facts.layout.join(' '),
  ].filter(Boolean);
  const text = facts.ownText ? ` "${(el.textContent ?? '').trim().slice(0, 40)}"` : '';
  return `<${facts.tag}>${text}  [${marks.join(' | ')}]`;
}

/** The mounted tree, one line per element, annotated with what each element
 * contributes. This is what an iteration on a single component reads. */
function tree(roots: readonly Element[], depth = 0): string {
  const lines: string[] = [];
  for (const root of roots) {
    lines.push(`${'  '.repeat(depth)}${label(root)}`);
    if (root.tagName.toLowerCase() === 'svg') {
      lines.push(`${'  '.repeat(depth + 1)}(${root.querySelectorAll('*').length} svg internals)`);
      continue;
    }
    lines.push(tree([...root.children], depth + 1));
  }
  return lines.filter(Boolean).join('\n');
}

export { digest, report, tree };
