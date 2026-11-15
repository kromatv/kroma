import { coverage, type LanguageStatus, type LocaleStatus, type Tally } from './status.ts';

const BAR_WIDTH = 16;

export function percent(tally: Tally): string {
  const share = coverage(tally) * 100;
  if (tally.missing === 0) return '100%';
  return `${Math.min(share, 99.9).toFixed(1)}%`;
}

function bar(tally: Tally): string {
  const filled = Math.floor(coverage(tally) * BAR_WIDTH);
  return `${'█'.repeat(filled)}${'░'.repeat(BAR_WIDTH - filled)}`;
}

function stageLabel(language: LanguageStatus): string {
  return language.source ? 'source' : language.stage;
}

type Row = readonly string[];

function aligned(rows: readonly Row[], numeric: readonly number[]): string[] {
  const widths = rows[0]?.map((_, at) => Math.max(...rows.map((row) => row[at]?.length ?? 0)));
  return rows.map((row) =>
    row
      .map((cell, at) =>
        numeric.includes(at) ? cell.padStart(widths?.[at] ?? 0) : cell.padEnd(widths?.[at] ?? 0),
      )
      .join('  ')
      .trimEnd(),
  );
}

function markdown(rows: readonly Row[], numeric: readonly number[]): string[] {
  const [head = [], ...body] = rows;
  const line = (row: Row) => `| ${row.join(' | ')} |`;
  const rule = head.map((_, at) => (numeric.includes(at) ? '---:' : '---'));
  return [line(head), line(rule), ...body.map(line)];
}

const HEAD: Row = [
  'Language',
  'Stage',
  'Translated',
  'Unreviewed',
  'Inherited',
  'Outdated',
  'Missing',
  'Coverage',
];
const COUNTS = [2, 3, 4, 5, 6, 7];

function counts(tally: Tally): string[] {
  return [
    `${tally.translated}`,
    `${tally.unreviewed}`,
    `${tally.inherited}`,
    `${tally.outdated}`,
    `${tally.missing}`,
    percent(tally),
  ];
}

/** One row per language, the source language first. */
export function overview(languages: readonly LanguageStatus[], names: Names): string {
  const rows: Row[] = [
    [...HEAD, ''],
    ...languages.map((language) => [
      `${language.locale}  ${names(language.locale)}`.trimEnd(),
      stageLabel(language),
      ...counts(language.tally),
      bar(language.tally),
    ]),
  ];
  return aligned(rows, COUNTS).join('\n');
}

export function overviewMarkdown(languages: readonly LanguageStatus[], names: Names): string {
  const rows: Row[] = [
    HEAD,
    ...languages.map((language) => [
      `\`${language.locale}\` ${names(language.locale)}`.trimEnd(),
      stageLabel(language),
      ...counts(language.tally),
    ]),
  ];
  return markdown(rows, COUNTS).join('\n');
}

/** A language's name for itself, or nothing where it has not said. */
export type Names = (locale: string) => string;

function fileRows(status: LocaleStatus): Row[] {
  const single = status.files.size === 1 && status.files.has('');
  return [...status.files]
    .filter(([, tally]) => tally.missing > 0 || tally.outdated > 0 || tally.unreviewed > 0)
    .map(([file, tally]) => [
      single ? status.set : `${status.set}  ${file}`,
      `${tally.total}`,
      ...counts(tally),
    ]);
}

function keyList(title: string, keys: readonly string[], limit: number): string[] {
  if (keys.length === 0) return [];
  const shown = keys.slice(0, limit).map((key) => `  ${key}`);
  const rest = keys.length > limit ? [`  and ${keys.length - limit} more`] : [];
  return ['', `${title} (${keys.length})`, ...shown, ...rest];
}

/** One language in full: every file with something left to do, then the keys. */
export function detail(language: LanguageStatus, names: Names, limit: number): string {
  const title = `${language.locale}  ${names(language.locale)}`.trimEnd();
  const { tally } = language;
  const summary = `${title}: ${stageLabel(language)}, ${percent(tally)} of ${tally.total} messages (${tally.outdated} outdated, ${tally.missing} missing, ${tally.unreviewed} unreviewed)`;
  const rows = language.sets.flatMap(fileRows);
  if (rows.length === 0) return `${summary}\nNothing left to translate.`;
  const table = aligned(
    [
      [
        'File',
        'Messages',
        'Translated',
        'Unreviewed',
        'Inherited',
        'Outdated',
        'Missing',
        'Coverage',
      ],
      ...rows,
    ],
    [1, 2, 3, 4, 5, 6, 7],
  );
  const outdated = language.sets.flatMap((status) => status.outdated);
  const missing = language.sets.flatMap((status) => status.missing);
  const unreviewed = language.sets.flatMap((status) => status.unreviewed);
  return [
    summary,
    '',
    ...table,
    ...keyList('Outdated', outdated, limit),
    ...keyList('Missing', missing, limit),
    ...keyList('Unreviewed', unreviewed, limit),
  ].join('\n');
}

function tallyJson(tally: Tally) {
  return { ...tally, coverage: Number(coverage(tally).toFixed(4)) };
}

/** The report as data: every language, and under it every set and file. */
export function asJson(languages: readonly LanguageStatus[]) {
  return {
    languages: languages.map((language) => ({
      locale: language.locale,
      stage: stageLabel(language),
      ...tallyJson(language.tally),
      sets: language.sets.map((status) => ({
        set: status.set,
        ...tallyJson(status.tally),
        files: Object.fromEntries(
          [...status.files].map(([file, tally]) => [file, tallyJson(tally)]),
        ),
        outdated: status.outdated,
        missing: status.missing,
        unreviewed: status.unreviewed,
      })),
    })),
  };
}
