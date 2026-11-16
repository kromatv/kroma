import { describe, expect, it } from 'vitest';
import type { RowView } from '#site/lib/views';
import {
  filterCounts,
  groupRows,
  isUntranslated,
  listedKeys,
  matchesQuery,
  matchesRowFilter,
  type MessageGroup,
  needsConfirm,
  sharedNotes,
  statusOf,
} from './row-filter';

function row(over: Partial<RowView> = {}): RowView {
  return {
    key: 'title',
    source: 'Title',
    references: [],
    current: null,
    draft: null,
    proposed: false,
    plural: null,
    issues: [],
    state: 'missing',
    notes: [],
    confirmed: false,
    ...over,
  };
}

const group = (...rows: RowView[]): MessageGroup => ({ key: rows[0]?.key ?? '', rows });

const done = (over: Partial<RowView> = {}) =>
  row({ current: 'Titre', state: 'translated', ...over });

describe('groupRows', () => {
  it('keeps each plural form with the message it is a form of', () => {
    const rows = [
      row({ key: 'a' }),
      row({ key: 'n', plural: 'other' }),
      row({ key: 'n_one', plural: 'one' }),
      row({ key: 'n_few', plural: 'few' }),
      row({ key: 'b' }),
    ];

    expect(groupRows(rows).map((g) => [g.key, g.rows.map((r) => r.key)])).toEqual([
      ['a', ['a']],
      ['n', ['n', 'n_one', 'n_few']],
      ['b', ['b']],
    ]);
  });

  it('starts a message of its own for a form whose base is not right before it', () => {
    const rows = [row({ key: 'a' }), row({ key: 'n_one', plural: 'one' })];

    expect(groupRows(rows).map((g) => g.key)).toEqual(['a', 'n_one']);
  });
});

describe('statusOf', () => {
  it('reads missing while any form has no text, even beside a draft', () => {
    expect(statusOf(group(row({ key: 'n', draft: 'x' }), row({ key: 'n_one' })))).toBe('missing');
  });

  it('reads the viewer’s unsent draft before what the lock says', () => {
    expect(statusOf(group(done({ draft: 'Neuf', state: 'outdated' })))).toBe('draft');
  });

  it('reads a draft in a pull request as proposed', () => {
    expect(statusOf(group(done({ draft: 'Neuf', proposed: true })))).toBe('proposed');
  });

  it('reads a confirmed message as confirmed', () => {
    expect(statusOf(group(done({ state: 'unreviewed', confirmed: true })))).toBe('confirmed');
  });

  it('reads outdated before unreviewed, and translated when nothing is asked', () => {
    expect(statusOf(group(done({ state: 'unreviewed' }), done({ state: 'outdated' })))).toBe(
      'outdated',
    );
    expect(statusOf(group(done({ state: 'unreviewed' })))).toBe('unreviewed');
    expect(statusOf(group(done()))).toBe('translated');
  });
});

describe('needsConfirm', () => {
  it('asks to confirm an outdated or unreviewed text the viewer has not touched', () => {
    expect(needsConfirm(group(done({ state: 'outdated' })))).toBe(true);
    expect(needsConfirm(group(done({ state: 'unreviewed' })))).toBe(true);
  });

  it('asks nothing once the viewer drafted or confirmed it', () => {
    expect(needsConfirm(group(done({ state: 'outdated', draft: 'Neuf' })))).toBe(false);
    expect(needsConfirm(group(done({ state: 'outdated', confirmed: true })))).toBe(false);
    expect(needsConfirm(group(done()))).toBe(false);
  });
});

describe('matchesRowFilter', () => {
  it('keeps every message under all', () => {
    expect(matchesRowFilter(group(done()), 'all')).toBe(true);
  });

  it('keeps a message with neither a translation nor an edit under missing', () => {
    expect(matchesRowFilter(group(row()), 'missing')).toBe(true);
    expect(matchesRowFilter(group(row({ draft: 'Titre' })), 'missing')).toBe(false);
  });

  it('keeps an outdated or unreviewed message under its own filter until it is handled', () => {
    expect(matchesRowFilter(group(done({ state: 'outdated' })), 'outdated')).toBe(true);
    expect(matchesRowFilter(group(done({ state: 'outdated' })), 'unreviewed')).toBe(false);
    expect(matchesRowFilter(group(done({ state: 'unreviewed' })), 'unreviewed')).toBe(true);
    expect(
      matchesRowFilter(group(done({ state: 'unreviewed', confirmed: true })), 'unreviewed'),
    ).toBe(false);
  });

  it('keeps the messages the viewer drafted or confirmed under mine', () => {
    expect(
      [done(), done({ draft: 'Neuf' }), done({ confirmed: true })].map((r) =>
        matchesRowFilter(group(r), 'mine'),
      ),
    ).toEqual([false, true, true]);
  });
});

describe('matchesQuery', () => {
  const message = group(row({ key: 'player.audio', source: 'Audio track', current: 'Piste' }));

  it('finds a message by its key, its source or its text, ignoring case', () => {
    expect(['PLAYER.', 'track', 'piste', '  '].map((q) => matchesQuery(message, q))).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it('finds a message by the viewer’s draft, and not by anything else', () => {
    const drafted = group(row({ draft: 'Brouillon' }));

    expect([matchesQuery(drafted, 'brouil'), matchesQuery(drafted, 'nowhere')]).toEqual([
      true,
      false,
    ]);
  });
});

describe('filterCounts', () => {
  it('counts the messages each filter lists', () => {
    const groups = [
      group(row()),
      group(done({ state: 'outdated' })),
      group(done({ state: 'unreviewed', draft: 'x' })),
    ];

    expect(filterCounts(groups)).toEqual({
      all: 3,
      missing: 1,
      outdated: 1,
      unreviewed: 0,
      mine: 1,
    });
  });
});

describe('listedKeys', () => {
  const groups = [group(row({ key: 'a' })), group(done({ key: 'b', source: 'Bravo' }))];

  it('lists every message while nothing narrows the list', () => {
    expect(listedKeys(groups, 'all', ' ')).toBeNull();
  });

  it('lists the messages that pass both the filter and the search', () => {
    expect(listedKeys(groups, 'missing', '')).toEqual(new Set(['a']));
    expect(listedKeys(groups, 'all', 'bravo')).toEqual(new Set(['b']));
    expect(listedKeys(groups, 'missing', 'bravo')).toEqual(new Set());
  });
});

describe('isUntranslated', () => {
  it('treats a translation of only spaces as missing', () => {
    expect(isUntranslated(row({ current: '  ' }))).toBe(true);
  });
});

describe('sharedNotes', () => {
  it('keeps the notes every message carries, in their order', () => {
    const groups = [
      group(row({ key: 'a', notes: ['Short.', 'Player.', 'A verb.'] })),
      group(row({ key: 'b', notes: ['Short.', 'Player.'] })),
    ];

    expect(sharedNotes(groups)).toEqual(['Short.', 'Player.']);
  });

  it('shares nothing in a section of one message, or of none', () => {
    expect(sharedNotes([group(row({ notes: ['Short.'] }))])).toEqual([]);
    expect(sharedNotes([])).toEqual([]);
  });
});
