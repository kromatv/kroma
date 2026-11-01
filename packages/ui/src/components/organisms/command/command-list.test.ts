import { describe, expect, it } from 'vitest';
import {
  ACTION_METRICS,
  actionOffsetOf,
  type CommandAction,
  type CommandItem,
  flatten,
  isTall,
  METRICS,
  offsetOf,
  opensDanger,
  scrollActionsTo,
  scrollTo,
  sectionsOf,
  stepTo,
} from './command-list';

const at = (label: string, group: string, keywords?: string): CommandItem => ({
  id: label.toLowerCase(),
  label,
  group,
  keywords,
});

const ITEMS = [
  at('Colors', 'Foundations', 'tokens'),
  at('Button', 'Actions'),
  at('Chip', 'Actions'),
  at('Field', 'Input'),
];

describe('sectionsOf', () => {
  it('groups by section, in the order the items were given', () => {
    const sections = sectionsOf(ITEMS, '');
    expect(sections.map((section) => section.title)).toEqual(['Foundations', 'Actions', 'Input']);
    expect(sections[1]?.items.map((item) => item.label)).toEqual(['Button', 'Chip']);
  });

  it('lists a query’s rows best first, under no heading, whatever their sections', () => {
    const items = [
      { id: 'kept', label: 'Modules', group: 'System', keywords: 'registry' },
      { id: 'other', label: 'Library', group: 'System' },
      { id: 'best', label: 'Reg', group: 'Browse' },
      { id: 'next', label: 'Regions', group: 'Browse' },
    ];

    const [section, ...others] = sectionsOf(items, 'reg');

    expect(others).toEqual([]);
    expect(section?.title).toBe('');
    expect(section?.items.map((item) => item.id)).toEqual(['best', 'next', 'kept']);
  });

  it('lists nothing at all for a query nothing answers', () => {
    expect(sectionsOf(ITEMS, 'zzz')).toEqual([]);
  });

  it('lets a boost lift a row over one that scores the same', () => {
    const items = [at('Regions', 'A'), at('Register', 'A')];

    const boost = (item: CommandItem) => (item.id === 'register' ? 40 : 0);

    expect(flatten(sectionsOf(items, 'reg', boost))[0]?.id).toBe('register');
  });

  it('does not let a boost list a row that does not match', () => {
    expect(sectionsOf(ITEMS, 'zzz', () => 1000)).toEqual([]);
  });

  it('finds a row through words that land on two of its fields', () => {
    const items = [{ id: 'network', label: 'Réseau', keywords: 'vpn pare-feu' }];

    expect(flatten(sectionsOf(items, 'reseau vpn'))[0]?.id).toBe('network');
  });

  it('puts what a row says above what it is filed under', () => {
    const items = [at('Mixer', 'Colors'), at('Colors', 'Foundations')];

    expect(flatten(sectionsOf(items, 'colors'))[0]?.id).toBe('colors');
  });

  it('searches the section and the keywords as well as the label', () => {
    expect(flatten(sectionsOf(ITEMS, 'actions'))).toHaveLength(2);
    expect(flatten(sectionsOf(ITEMS, 'tokens')).map((item) => item.label)).toEqual(['Colors']);
    expect(flatten(sectionsOf(ITEMS, 'zzz'))).toHaveLength(0);
  });

  it('leaves an item that names no section in a run of its own', () => {
    const loose = sectionsOf([{ id: 'a', label: 'Alone' }], '');
    expect(loose).toEqual([{ title: '', items: [{ id: 'a', label: 'Alone' }] }]);
  });

  it('ignores the case and the padding of a query', () => {
    expect(flatten(sectionsOf(ITEMS, '  CHIP  ')).map((item) => item.label)).toEqual(['Chip']);
  });
});

describe('offsetOf', () => {
  const sections = sectionsOf(ITEMS, '');

  it('puts the first result under the first heading', () => {
    expect(offsetOf(sections, 0)).toBe(METRICS.pad + METRICS.heading);
  });

  it('counts every heading it passes on the way down', () => {
    expect(offsetOf(sections, 1)).toBe(
      METRICS.pad + METRICS.heading + METRICS.row + METRICS.sectionGap + METRICS.heading,
    );
    expect(offsetOf(sections, 2) - offsetOf(sections, 1)).toBe(METRICS.row);
  });

  // The pixel looks like rounding and is not: the offset is arithmetic rather
  // than a measurement, so it accumulates - four sections down the cursor was
  // computed 4pt above where it sits, which is enough to make the in-view test
  // wrong at the edge and jump the scroller.
  it('counts the gap between sections, which the list actually draws', () => {
    const across = offsetOf(sections, 1) - offsetOf(sections, 0);
    expect(across).toBe(METRICS.row + METRICS.sectionGap + METRICS.heading);
  });

  it('skips the heading of a run that has no title', () => {
    const loose = sectionsOf([{ id: 'a', label: 'Alone' }], '');
    expect(offsetOf(loose, 0)).toBe(METRICS.pad);
  });

  it('grows monotonically, so the scroller never jumps backwards', () => {
    const offsets = flatten(sections).map((_, index) => offsetOf(sections, index));
    for (let index = 1; index < offsets.length; index += 1) {
      expect(offsets[index]).toBeGreaterThan(offsets[index - 1] as number);
    }
  });
});

describe('a row with a tile', () => {
  it('keeps the plain height, the tile being the size of an icon’s well', () => {
    expect(isTall({ id: 'a', label: 'A', image: 'a.svg', imageShape: 'tile' })).toBe(false);
  });

  it('keeps it with a second line too, so it matches the rows around it', () => {
    const row = { id: 'a', label: 'A', subtitle: 'B', image: 'a.svg', imageShape: 'tile' as const };

    expect(isTall(row)).toBe(false);
  });
});

describe('a row with a poster', () => {
  const titled = (id: string, extra: Partial<CommandItem>): CommandItem => ({
    id,
    label: id,
    ...extra,
  });
  const run = (...items: CommandItem[]) => [{ title: '', items }];

  it('takes the tall height, a poster being taller than a plain row', () => {
    expect(isTall(titled('a', { image: 'poster.jpg' }))).toBe(true);
  });

  it('is the only row that does: a second line fits in a plain one', () => {
    expect(isTall(titled('a', { subtitle: 'Film · 2024' }))).toBe(false);
  });

  it('pushes the rows under it down by that much', () => {
    const list = run(titled('a', { image: 'poster.jpg' }), titled('b', {}), titled('c', {}));

    expect(offsetOf(list, 1)).toBe(METRICS.pad + METRICS.tallRow);
    expect(offsetOf(list, 2)).toBe(METRICS.pad + METRICS.tallRow + METRICS.row);
  });

  it('is brought fully into view when the cursor reaches it', () => {
    const list = run(titled('a', {}), titled('b', { image: 'poster.jpg' }));

    expect(scrollTo(list, 1, 0, 60)).toBe(
      METRICS.pad + METRICS.row + METRICS.tallRow - 60 + METRICS.pad,
    );
  });

  it('counts as out of view when only its top fits', () => {
    const list = run(titled('a', { image: 'poster.jpg' }));

    expect(scrollTo(list, 0, 0, METRICS.pad + METRICS.row)).not.toBeNull();
  });
});

describe('scrollTo', () => {
  const sections = sectionsOf(ITEMS, '');

  it('leaves the list alone while the row is already on screen', () => {
    expect(scrollTo(sections, 0, 0, METRICS.maxHeight)).toBeNull();
  });

  it('brings a row below the fold up by as little as it can', () => {
    expect(scrollTo(sections, 3, 0, 100)).toBe(
      offsetOf(sections, 3) + METRICS.row - 100 + METRICS.pad,
    );
  });

  it('comes back up to a row above what is shown', () => {
    expect(scrollTo(sections, 0, 200, METRICS.maxHeight)).toBe(offsetOf(sections, 0) - METRICS.pad);
  });
});

describe('the action panel’s geometry', () => {
  const ACTIONS: CommandAction[] = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C', danger: true },
    { id: 'd', label: 'D', danger: true },
  ];
  const { pad, row, rule } = ACTION_METRICS;

  it('draws one rule, above the first dangerous action', () => {
    expect(ACTIONS.map((_, at) => opensDanger(ACTIONS, at))).toEqual([false, false, true, false]);
  });

  it('draws no rule above a dangerous action that comes first, with nothing to set it apart from', () => {
    expect(opensDanger([{ id: 'c', label: 'C', danger: true }], 0)).toBe(false);
  });

  it('counts the rows above an action', () => {
    expect(actionOffsetOf(ACTIONS, 1)).toBe(pad + row);
  });

  it('counts the rule above the first dangerous action', () => {
    expect(actionOffsetOf(ACTIONS, 2)).toBe(pad + 2 * row + rule);
  });

  it('counts it once for every one after', () => {
    expect(actionOffsetOf(ACTIONS, 3)).toBe(pad + 3 * row + rule);
  });

  it('leaves the panel alone while the action is on screen', () => {
    expect(scrollActionsTo(ACTIONS, 1, 0, 200)).toBeNull();
  });

  it('brings an action below the fold up by as little as it can', () => {
    expect(scrollActionsTo(ACTIONS, 3, 0, 100)).toBe(pad + 4 * row + rule + pad - 100);
  });

  it('comes back to the top for the first action', () => {
    expect(scrollActionsTo(ACTIONS, 0, 60, 100)).toBe(0);
  });

  it('stays put with no action under the cursor', () => {
    expect(scrollActionsTo(ACTIONS, -1, 60, 100)).toBeNull();
  });
});

describe('stepTo', () => {
  it('wraps at both ends', () => {
    expect(stepTo(3, 1, 4)).toBe(0);
    expect(stepTo(0, -1, 4)).toBe(3);
  });

  it('keeps a page step non-negative before it wraps', () => {
    expect(stepTo(1, -8, 4)).toBe(1);
    expect(stepTo(0, 8, 11)).toBe(8);
  });

  it('stays at the top of a list with nothing in it', () => {
    expect(stepTo(0, 1, 0)).toBe(0);
  });

  it('brings a cursor past the end back inside before stepping', () => {
    expect(stepTo(99, 1, 4)).toBe(0);
  });
});

describe('what a row does not show', () => {
  it('has to contain the query, since scattered letters there would explain nothing', () => {
    const filed = at('Films', 'Découvrir');

    expect(flatten(sectionsOf([filed], 'du'))).toEqual([]);
  });

  it('matches when it contains the query, whatever its accents and separators', () => {
    const filed = at('Réseau', 'System', 'vpn pare-feu');

    expect(flatten(sectionsOf([filed], 'parefeu')).map((item) => item.id)).toEqual(['réseau']);
  });

  it('finds a row by what its second line says', () => {
    const episode: CommandItem = { id: 'e', label: 'Secrets', subtitle: 'Dark · S01E02' };

    expect(flatten(sectionsOf([episode], 'dark')).map((item) => item.id)).toEqual(['e']);
  });

  it('leaves scattered letters to work on the label', () => {
    expect(flatten(sectionsOf([at('Button', 'Actions')], 'btn')).map((item) => item.id)).toEqual([
      'button',
    ]);
  });
});

describe('a row marked always', () => {
  const OUT: CommandItem = { id: 'out', label: 'Search everywhere', always: true, meta: 'but' };

  it('stays listed for a query that matches nothing on it', () => {
    expect(flatten(sectionsOf([OUT], 'zzz')).map((item) => item.id)).toEqual(['out']);
  });

  it('sits below a row that matched on its keywords, whatever its meta scores', () => {
    const keyworded = at('Colors', 'Foundations', 'a but b');

    expect(flatten(sectionsOf([OUT, keyworded], 'but')).map((item) => item.id)).toEqual([
      'colors',
      'out',
    ]);
  });

  it('ranks on its label when the label matches', () => {
    expect(flatten(sectionsOf([at('Field', 'Input'), OUT], 'search'))[0]?.id).toBe('out');
  });
});
