import type { UnmeasuredArea } from './coverage';
import type { CrapEntry, CrapReport, LanguageCrap, ScoredEntry } from './crap';
import { type Cluster, type DryReport, type Duplicate, spanLabel } from './dry';
import type { Outcome } from './outcome';
import type { Language } from './sources';

const NAMES: Record<Language, string> = { typescript: 'TypeScript', rust: 'Rust' };

const cell = (text: string) => text.replaceAll('|', String.raw`\|`);

const row = (cells: readonly string[]) => `| ${cells.map(cell).join(' | ')} |`;

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  return [row(headers), row(headers.map(() => '---')), ...rows.map(row)].join('\n');
}

const called = (entry: CrapEntry) => `\`${entry.namespace}::${entry.name}\``;

const scoredRow = (entry: ScoredEntry) => [
  entry.crap.toFixed(1),
  String(entry.complexity),
  `${entry.coverage.toFixed(1)}%`,
  called(entry),
];

function countsRow({ language, scored, summary }: LanguageCrap): string[] {
  const counts = scored
    ? [summary.atLeast10, summary.atLeast30, summary.uncovered].map(String)
    : ['n/a', 'n/a', 'n/a'];
  return [NAMES[language], String(summary.functions), ...counts];
}

function worstOf({ language, scored, summary }: LanguageCrap): string {
  const name = NAMES[language];
  if (!scored) {
    return [
      `### Most complex functions, ${name}`,
      '',
      `No coverage report holds a ${name} file, so ${name} is scored on complexity alone.`,
      '',
      table(
        ['CC', 'Function'],
        summary.mostComplex.map((entry) => [String(entry.complexity), called(entry)]),
      ),
    ].join('\n');
  }
  const columns = ['CRAP', 'CC', 'Coverage', 'Function'];
  return [
    `### Worst functions, ${name}`,
    '',
    table(columns, summary.worst.map(scoredRow)),
    '',
    `### Worst functions a test reaches, ${name}`,
    '',
    table(columns, summary.worstTested.map(scoredRow)),
  ].join('\n');
}

function unmeasuredOf(areas: readonly UnmeasuredArea[]): string[] {
  if (areas.length === 0) {
    return [];
  }
  return [
    '',
    '### Read as 0% because nothing measures them',
    '',
    'No coverage report holds a record for any source file of these, so every function in them reads 0%.',
    '',
    table(
      ['Area', 'Language', 'Files'],
      areas.map((area) => [`\`${area.area}\``, NAMES[area.language], String(area.files)]),
    ),
  ];
}

/** The CRAP half of the report as Markdown. */
export function renderCrap(report: CrapReport): string {
  const reports = report.coverageReports.map((path) => `\`${path}\``).join(', ');
  return [
    '## CRAP',
    '',
    reports.length > 0 ? `Coverage read from ${reports}.` : 'No coverage report was found.',
    '',
    table(
      ['Language', 'Functions', 'CRAP 10 or more', 'CRAP 30 or more', 'At 0% coverage'],
      report.languages.map(countsRow),
    ),
    '',
    report.languages.map(worstOf).join('\n\n'),
    ...unmeasuredOf(report.unmeasured),
  ].join('\n');
}

const pairRow = (pair: Duplicate) => [
  pair.score.toFixed(2),
  pair.language,
  `\`${spanLabel(pair.left)}\``,
  `\`${spanLabel(pair.right)}\``,
];

function clusterRow(cluster: Cluster): string[] {
  const [first] = cluster.forms;
  const example = first === undefined ? '' : `\`${spanLabel(first)}\``;
  return [String(cluster.forms.length), String(cluster.lines), example];
}

/** The duplication half of the report as Markdown. */
export function renderDry({ threshold, summary }: DryReport): string {
  return [
    '## Duplication',
    '',
    `Pairs of functions that score ${threshold} or above. A pair with test code on either side is counted apart.`,
    '',
    table(
      ['Production pairs', 'Exact', 'Across two files', 'Clusters', 'Pairs with test code'],
      [
        [summary.production, summary.exact, summary.crossFile, summary.clusters, summary.test].map(
          String,
        ),
      ],
    ),
    '',
    '### Largest pairs',
    '',
    table(['Score', 'Language', 'Left', 'Right'], summary.largestPairs.map(pairRow)),
    '',
    '### Largest clusters',
    '',
    table(['Forms', 'Lines', 'One of them'], summary.largestClusters.map(clusterRow)),
    '',
    'Every pair is in `.metrics/dry-production.tsv` and `.metrics/dry-test.tsv`.',
  ].join('\n');
}

function section<T>(title: string, outcome: Outcome<T>, render: (value: T) => string): string {
  return outcome.ok ? render(outcome.value) : `## ${title}\n\nNot produced: ${outcome.reason}`;
}

/** The whole report as Markdown. A half that failed says why, and the other half is still there. */
export function renderSummary(crap: Outcome<CrapReport>, dry: Outcome<DryReport>): string {
  return [
    '# Code quality report',
    '',
    'A report, not a gate: no number here blocks a merge. `docs/quality.md` says what each one means and what it cannot see.',
    '',
    section('CRAP', crap, renderCrap),
    '',
    section('Duplication', dry, renderDry),
    '',
  ].join('\n');
}
