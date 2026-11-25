import { type Actor, TITLE_EDIT_LIMITS } from '@kromatv/client/media';

/** One actor as a form holds them, under a key that stays theirs while the
 * rows around them come and go. */
export interface CastRow {
  key: string;
  name: string;
  role: string;
}

/** The cast as a form holds it. `shown` stays true while the rows are the
 * cast the page shows and nothing was changed, which saving leaves to the
 * provider; `added` counts the rows added, so each gets a key of its own. */
export interface CastDraft {
  rows: readonly CastRow[];
  shown: boolean;
  added: number;
}

type Credited = Readonly<{ name: string; character?: string | null }>;

const rowOf = (key: string, name: string, role?: string | null): CastRow => ({
  key,
  name,
  role: role ?? '',
});

/** The rows for the cast that was `written`, or for the one the page shows
 * when nothing was. */
export function castDraftOf(
  written: readonly Actor[] | null,
  shown: readonly Credited[],
): CastDraft {
  const listed = written ?? shown.map((member) => ({ name: member.name, role: member.character }));
  return {
    rows: listed.map((actor, at) => rowOf(`listed-${at}`, actor.name, actor.role)),
    shown: written === null,
    added: 0,
  };
}

/** The draft with an empty row at its end. */
export function withActor(draft: CastDraft): CastDraft {
  const added = draft.added + 1;
  return { rows: [...draft.rows, rowOf(`added-${added}`, '')], shown: false, added };
}

/** The draft without the row under `key`. */
export function withoutActor(draft: CastDraft, key: string): CastDraft {
  return { ...draft, rows: draft.rows.filter((row) => row.key !== key), shown: false };
}

const fit = (text: string | undefined, max: number) => text?.slice(0, max);

/** The draft with the row under `key` holding `change`, each text cut to what
 * the server keeps. */
export function withRow(
  draft: CastDraft,
  key: string,
  change: Readonly<Partial<Pick<CastRow, 'name' | 'role'>>>,
): CastDraft {
  const name = fit(change.name, TITLE_EDIT_LIMITS.person);
  const role = fit(change.role, TITLE_EDIT_LIMITS.role);
  const changed = (row: CastRow) => ({ ...row, name: name ?? row.name, role: role ?? row.role });
  const rows = draft.rows.map((row) => (row.key === key ? changed(row) : row));
  return { ...draft, rows, shown: false };
}

/** The cast a form asks for, each actor without a name left out. Null while
 * it is still the cast the page shows, or names nobody, so the title follows
 * the `.nfo` file or the provider. */
export function castOf(draft: CastDraft): Actor[] | null {
  if (draft.shown) {
    return null;
  }
  const cast = draft.rows
    .map((row) => ({ name: row.name.trim(), role: row.role.trim() || null }))
    .filter((actor) => actor.name !== '');
  return cast.length > 0 ? cast : null;
}
