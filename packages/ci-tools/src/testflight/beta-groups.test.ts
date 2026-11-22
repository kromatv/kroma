import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import type { Asc } from './asc-client';
import { type BetaGroup, pickGroup, resolveGroup } from './beta-groups';

const group = (id: string, attributes: Partial<BetaGroup['attributes']>): BetaGroup => ({
  id,
  attributes: { name: id, isInternalGroup: false, ...attributes },
});

const groups = [
  group('team', { name: 'Canary', isInternalGroup: true }),
  group('beta', { name: 'Public', publicLinkId: 'ZjgQdunW', publicLinkEnabled: true }),
  group('canary', { name: 'Canary', publicLinkId: 'Xyz', publicLinkEnabled: true }),
];

const fakeAsc = (existing: BetaGroup[]) => {
  const created = group('new', {
    name: 'Canary',
    publicLink: 'https://testflight.apple.com/join/New',
  });
  const create: unknown[][] = [];
  const asc: Asc = {
    get: async <T>(_path: string, schema: z.ZodType<T>) => schema.parse({ data: existing }),
    post: vi.fn(),
    create: async <T>(path: string, body: unknown, schema: z.ZodType<T>) => {
      create.push([path, body]);
      return schema.parse({ data: created });
    },
  };
  return { asc, create };
};

describe('pickGroup', () => {
  it('finds the public group by the id in its link', () => {
    expect(pickGroup(groups, { link: 'ZjgQdunW' })?.id).toBe('beta');
  });

  it("finds an external group by name, never the team's own", () => {
    expect(pickGroup(groups, { name: 'Canary' })?.id).toBe('canary');
  });
});

describe('resolveGroup', () => {
  it('creates a named group with its public link on when the app has none', async () => {
    const { asc, create } = fakeAsc([]);

    const found = await resolveGroup(asc, 'app-1', { wanted: { name: 'Canary' }, create: true });

    expect(found.id).toBe('new');
    expect(create).toEqual([
      [
        'betaGroups',
        {
          data: {
            type: 'betaGroups',
            attributes: { name: 'Canary', publicLinkEnabled: true, feedbackEnabled: true },
            relationships: { app: { data: { type: 'apps', id: 'app-1' } } },
          },
        },
      ],
    ]);
  });

  it('never creates a group wanted by its link, or one it was not told to create', async () => {
    const { asc, create } = fakeAsc([]);

    await expect(
      resolveGroup(asc, 'app-1', { wanted: { link: 'ZjgQdunW' }, create: true }),
    ).rejects.toThrow(/no external TestFlight group/);
    await expect(
      resolveGroup(asc, 'app-1', { wanted: { name: 'Canary' }, create: false }),
    ).rejects.toThrow(/no external TestFlight group/);
    expect(create).toEqual([]);
  });
});
