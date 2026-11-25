import { TITLE_EDIT_LIMITS } from '@kromatv/client/media';
import { expect, it } from 'vitest';
import { castDraftOf, castOf, withActor, withoutActor, withRow } from './title-cast-draft';

const SHOWN = [
  { name: 'Al Pacino', character: 'Vincent Hanna' },
  { name: 'Val Kilmer', character: null },
];

it('holds the cast written, or the one the page shows when nothing was', () => {
  const written = castDraftOf([{ name: 'Jane Doe', role: null }], SHOWN);
  const shown = castDraftOf(null, SHOWN);

  expect(written.shown).toBe(false);
  expect(written.rows.map((row) => [row.name, row.role])).toEqual([['Jane Doe', '']]);
  expect(shown.shown).toBe(true);
  expect(shown.rows.map((row) => [row.name, row.role])).toEqual([
    ['Al Pacino', 'Vincent Hanna'],
    ['Val Kilmer', ''],
  ]);
});

it('leaves the cast to the provider until a row changes', () => {
  const shown = castDraftOf(null, SHOWN);

  const changed = withRow(shown, shown.rows[1]?.key ?? '', { role: ' Chris Shiherlis ' });

  expect(castOf(shown)).toBeNull();
  expect(castOf(changed)).toEqual([
    { name: 'Al Pacino', role: 'Vincent Hanna' },
    { name: 'Val Kilmer', role: 'Chris Shiherlis' },
  ]);
});

it('adds rows under keys of their own and drops the ones with no name', () => {
  const draft = withActor(withActor(castDraftOf([{ name: 'Jane Doe', role: null }], [])));
  const [, first, second] = draft.rows;

  const named = withRow(draft, first?.key ?? '', { name: 'John Doe' });

  expect(new Set(draft.rows.map((row) => row.key)).size).toBe(3);
  expect(second?.key).not.toBe(first?.key);
  expect(castOf(named)).toEqual([
    { name: 'Jane Doe', role: null },
    { name: 'John Doe', role: null },
  ]);
});

it('hands the cast back to the provider once nobody is left', () => {
  const draft = castDraftOf([{ name: 'Jane Doe', role: 'A pilot' }], SHOWN);

  const emptied = withoutActor(draft, draft.rows[0]?.key ?? '');

  expect(emptied.rows).toEqual([]);
  expect(castOf(emptied)).toBeNull();
});

it('cuts a name and a part to what the server keeps', () => {
  const draft = withActor(castDraftOf(null, []));
  const key = draft.rows[0]?.key ?? '';

  const long = withRow(draft, key, { name: 'n'.repeat(500), role: 'r'.repeat(500) });

  expect(long.rows[0]?.name).toHaveLength(TITLE_EDIT_LIMITS.person);
  expect(long.rows[0]?.role).toHaveLength(TITLE_EDIT_LIMITS.role);
});
