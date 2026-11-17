import { stageOf } from '@kromatv/i18n/model';
import type { Messages } from '#site/core/catalog';
import { inspect, type Standing } from '#site/core/lock';
import { type Row, rowsFor } from '#site/core/rows';
import { localeFiles, lockOn } from '#site/core/shelf';
import { baseOf, merged, type Source } from '#site/core/source';
import type { Language, LocaleSummary, Progress, RowState, StateCounts } from '#site/lib/views';
import type { Reading, Workspace } from './workspace';

/** One row of a language, with the text the default branch gives it and where it stands. */
export interface Stood {
  row: Row;
  current: string | null;
  state: RowState;
}

/** A language's rows, by the source file that holds them. */
export type RowsByFile = Map<string, Stood[]>;

function rowStateOf(text: string, stood: Standing | undefined): RowState {
  if (text.trim() === '') {
    return 'missing';
  }
  return stood === undefined || stood === 'missing' ? 'translated' : stood;
}

async function standingIn(reading: Reading, locale: string) {
  const target: Messages = merged(localeFiles(reading.shelf, locale));
  if (locale === reading.source.locale) {
    return { target, standing: new Map<string, Standing>() };
  }
  const { standing } = await inspect(reading.against, target, lockOn(reading.shelf, locale));
  return { target, standing };
}

function stoodIn(source: Source, at: { target: Messages; standing: Map<string, Standing> }) {
  return (row: Row): Stood => {
    const current = at.target[row.key] ?? null;
    const base = baseOf(source, row.key) ?? row.key;
    return { row, current, state: rowStateOf(current ?? '', at.standing.get(base)) };
  };
}

/** Every row `locale` owes, file by file, with where each stands against the source and the lock. */
export async function rowsByFile(reading: Reading, locale: string): Promise<RowsByFile> {
  const at = await standingIn(reading, locale);
  const stood = stoodIn(reading.source, at);
  return new Map(
    [...reading.source.files].map(([file, messages]) => [
      file,
      rowsFor(messages, locale).map(stood),
    ]),
  );
}

/** How many of `rows` stand in each state, and how far along they are. */
export function tally(rows: readonly Stood[]): { progress: Progress; states: StateCounts } {
  const states: StateCounts = { missing: 0, translated: 0, outdated: 0, unreviewed: 0 };
  for (const { state } of rows) {
    states[state] += 1;
  }
  return { progress: { done: rows.length - states.missing, total: rows.length }, states };
}

/** One language of a workspace, named, staged and counted. */
export function localeSummary(
  workspace: Workspace,
  language: Language,
  byFile: RowsByFile,
): LocaleSummary {
  const { tag } = language;
  return {
    language,
    stage: stageOf(workspace.policy, tag),
    ...tally([...byFile.values()].flat()),
    isSource: tag === workspace.policy.source,
    started: workspace.started.has(tag),
  };
}
