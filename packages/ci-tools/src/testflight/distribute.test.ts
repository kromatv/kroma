import { afterEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { type Asc, AscError } from './asc-client';
import type { BetaGroup } from './beta-groups';
import { feed, needsReview, processed } from './distribute';

vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(async () => {}) }));

const group: BetaGroup = { id: 'canary', attributes: { name: 'Canary', isInternalGroup: false } };
const build = { id: 'b9', attributes: { version: '3500000', processingState: 'VALID' } };

interface World {
  newest: (typeof build)[];
  inGroup: boolean;
  states: string[];
  review?: Error;
}

const fakeAsc = (world: World) => {
  const posts: string[] = [];
  const answer = (path: string): unknown => {
    if (path.includes('buildBetaDetail')) {
      return { data: { attributes: { externalBuildState: world.states.shift() ?? null } } };
    }
    if (path.includes('filter%5BbetaGroups%5D')) {
      return { data: world.inGroup ? [build] : [] };
    }
    return { data: world.newest };
  };
  const asc: Asc = {
    get: async <T>(path: string, schema: z.ZodType<T>) => schema.parse(answer(path)),
    post: async (path: string) => {
      if (path === 'betaAppReviewSubmissions' && world.review) {
        throw world.review;
      }
      posts.push(path);
    },
    create: vi.fn(),
  };
  return { asc, posts };
};

const target = { app: 'app-1', group };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('feed', () => {
  it('adds a new build to the group and sends it to Beta App Review', async () => {
    const { asc, posts } = fakeAsc({
      newest: [build],
      inGroup: false,
      states: ['READY_FOR_BETA_SUBMISSION', 'WAITING_FOR_BETA_REVIEW'],
    });

    const delivery = await feed(asc, target, 'IOS');

    expect(posts).toEqual(['betaGroups/canary/relationships/builds', 'betaAppReviewSubmissions']);
    expect(delivery).toEqual({
      platform: 'IOS',
      build: '3500000',
      added: true,
      review: 'submitted',
      state: 'WAITING_FOR_BETA_REVIEW',
    });
  });

  it('changes nothing when the group already has the newest build', async () => {
    const { asc, posts } = fakeAsc({ newest: [build], inGroup: true, states: ['IN_BETA_TESTING'] });

    const delivery = await feed(asc, target, 'TV_OS');

    expect(posts).toEqual([]);
    expect(delivery).toMatchObject({
      added: false,
      review: 'not needed',
      state: 'IN_BETA_TESTING',
    });
  });

  it('submits a build that is in the group but was never sent to review', async () => {
    const { asc, posts } = fakeAsc({
      newest: [build],
      inGroup: true,
      states: ['READY_FOR_BETA_SUBMISSION', 'IN_BETA_REVIEW'],
    });

    await feed(asc, target, 'IOS');

    expect(posts).toEqual(['betaAppReviewSubmissions']);
  });

  it('keeps the build in the group and warns when Apple refuses the submission', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { asc } = fakeAsc({
      newest: [build],
      inGroup: false,
      states: ['READY_FOR_BETA_SUBMISSION'],
      review: new AscError(422, 'Another build is in review', 'POST betaAppReviewSubmissions'),
    });

    const delivery = await feed(asc, target, 'IOS');

    expect(delivery).toMatchObject({ added: true, review: 'refused' });
    expect(log).toHaveBeenCalledWith(
      '::warning::Beta App Review refused build 3500000: Another build is in review',
    );
  });

  it('reports a platform with no build to give', async () => {
    const { asc, posts } = fakeAsc({ newest: [], inGroup: false, states: [] });

    expect(await feed(asc, target, 'TV_OS')).toMatchObject({ build: null, added: false });
    expect(posts).toEqual([]);
  });
});

describe('needsReview', () => {
  it('is only a build ready for its beta submission', () => {
    expect(needsReview('READY_FOR_BETA_SUBMISSION')).toBe(true);
    expect(needsReview('BETA_APPROVED')).toBe(false);
    expect(needsReview(null)).toBe(false);
  });
});

const polling = (...states: string[]) => {
  const asc: Asc = {
    get: async <T>(_path: string, schema: z.ZodType<T>) => {
      const state = states.shift();
      const data = state
        ? [{ ...build, attributes: { ...build.attributes, processingState: state } }]
        : [];
      return schema.parse({ data });
    },
    post: vi.fn(),
    create: vi.fn(),
  };
  return asc;
};

describe('processed', () => {
  const wanted = { app: 'app-1', platform: 'IOS' as const, version: '3500000' };

  it('waits through processing until Apple marks the build valid', async () => {
    expect(await processed(polling('', 'PROCESSING', 'VALID'), wanted, Date.now() + 60_000)).toBe(
      true,
    );
  });

  it('throws when Apple refuses the build', async () => {
    await expect(processed(polling('INVALID'), wanted, Date.now() + 60_000)).rejects.toThrow(
      /IOS build 3500000 INVALID/,
    );
  });

  it('gives up once the deadline has passed', async () => {
    expect(await processed(polling('PROCESSING'), wanted, Date.now() - 1)).toBe(false);
  });
});
