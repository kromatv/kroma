import { describe, expect, it } from 'vitest';
import {
  attachTiers,
  GROUP_ORDER,
  matches,
  orderStories,
  slug,
  TIER_ORDER,
  tierFor,
} from './registry';
import { type Story, story } from './story';

describe('slug', () => {
  it('cuts a name at its case changes', () => {
    expect(slug('ProgressRing')).toBe('progress-ring');
  });

  it('strips diacritics rather than turning them into separators', () => {
    expect(slug('Icônes')).toBe('icones');
  });
});

describe('tierFor', () => {
  it('reads the atomic level out of the file path, because the folder IS the claim', () => {
    expect(tierFor('../components/atoms/button/button.stories.tsx')).toBe('Atoms');
    expect(tierFor('../components/molecules/field/field.stories.tsx')).toBe('Molecules');
    expect(tierFor('../components/organisms/rail/rail.stories.tsx')).toBe('Organisms');
    expect(tierFor('../components/templates/tv-stage/tv-stage.stories.tsx')).toBe('Templates');
    expect(tierFor('./foundations/colors.stories.tsx')).toBe('Foundations');
  });

  it('names an unplaced story rather than guessing at it', () => {
    expect(tierFor('../somewhere/else.stories.tsx')).toBe('Other');
  });

  it('lists the levels in the order the design system builds them up', () => {
    expect(TIER_ORDER.slice(0, 5)).toEqual([
      'Foundations',
      'Atoms',
      'Molecules',
      'Organisms',
      'Templates',
    ]);
  });
});

describe('orderStories', () => {
  const make = (tier: string, group: string, name: string) =>
    ({ id: slug(name), tier, group, name }) as Story;

  it('sorts by functional group first, so every input sits in one section', () => {
    const sorted = orderStories([
      make('Organisms', 'Media', 'Rail'),
      make('Molecules', 'Input', 'Field'),
      make('Atoms', 'Input', 'Switch'),
      make('Foundations', 'Foundations', 'Colors'),
      make('Atoms', 'Actions', 'Button'),
    ]);
    expect(sorted.map((entry) => entry.name)).toEqual([
      'Colors',
      'Button',
      'Field',
      'Switch',
      'Rail',
    ]);
  });

  it('ignores the atomic level entirely: it is for kit editors, not the reader', () => {
    const sorted = orderStories([
      make('Organisms', 'Actions', 'Menu'),
      make('Atoms', 'Actions', 'Button'),
    ]);
    expect(sorted.map((entry) => entry.name)).toEqual(['Button', 'Menu']);
    expect(GROUP_ORDER).toContain('Brand');
  });

  it('puts an unlisted group last, alphabetically, instead of silently dropping it', () => {
    const sorted = orderStories([
      make('Atoms', 'Zzz unknown', 'Thing'),
      make('Atoms', 'Brand', 'Logo'),
    ]);
    expect(sorted.map((entry) => entry.group)).toEqual(['Brand', 'Zzz unknown']);
  });

  it('sorts a story whose tier was never attached instead of crashing', () => {
    const orphan = { id: 'orphan', group: 'Media', name: 'Orphan' } as Story;
    expect(() => orderStories([orphan, make('Atoms', 'Actions', 'Button')])).not.toThrow();
  });
});

describe('attachTiers', () => {
  const stories = [
    story({ name: 'Button', group: 'Actions', render: () => null }),
    story({ name: 'Card', group: 'Media', render: () => null }),
  ];

  it('attaches the level each story’s own path implies', () => {
    const paths = [
      '../components/atoms/button/button.stories.tsx',
      '../components/molecules/card/card.stories.tsx',
    ];
    expect(attachTiers(stories, paths).map((entry) => entry.tier)).toEqual(['Atoms', 'Molecules']);
  });

  it('leaves a story the bundler listed no path for unplaced rather than crashing', () => {
    const paths = ['./foundations/colors.stories.tsx'];
    expect(attachTiers(stories, paths).map((entry) => entry.tier)).toEqual([
      'Foundations',
      'Other',
    ]);
  });
});

describe('matches', () => {
  const built = { ...story({ name: 'Poster card', group: 'Media', render: () => null }) };

  it('takes every story while the search box is empty', () => {
    expect(matches(built, '')).toBe(true);
  });

  it('reads the name, the group and the atomic level, case-insensitively', () => {
    const placed = { ...built, tier: 'Molecules' };
    expect(matches(placed, 'poSTer')).toBe(true);
    expect(matches(placed, 'MEDIA')).toBe(true);
    expect(matches(placed, 'molecul')).toBe(true);
    expect(matches(placed, 'switch')).toBe(false);
  });

  it('searches a story whose tier was never attached instead of crashing', () => {
    const orphan = { id: 'orphan', group: 'Media', name: 'Orphan' } as Story;
    expect(matches(orphan, 'orphan')).toBe(true);
    expect(matches(orphan, 'atoms')).toBe(false);
  });
});
