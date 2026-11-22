import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { type Asc, AscError } from './asc-client';
import type { Platform } from './app-inputs';
import type { BetaGroup } from './beta-groups';

const POLL_MS = 30_000;

const Build = z.object({
  id: z.string(),
  attributes: z.object({ version: z.string(), processingState: z.string() }),
});

const Builds = z.object({ data: z.array(Build) });

const Detail = z.object({
  data: z.object({ attributes: z.object({ externalBuildState: z.string().nullish() }) }),
});

/** A build App Store Connect holds for one platform. */
export type TestFlightBuild = z.infer<typeof Build>;

/** What feeding a group did for one platform, for the run summary. */
export interface Delivery {
  platform: Platform;
  build: string | null;
  added: boolean;
  review: 'submitted' | 'refused' | 'not needed';
  state: string | null;
}

const query = (params: Record<string, string>) => new URLSearchParams(params).toString();

/** The newest build of `platform` that testers can install, or null. */
export async function newestBuild(asc: Asc, app: string, platform: Platform) {
  const params = {
    'filter[app]': app,
    'filter[preReleaseVersion.platform]': platform,
    'filter[processingState]': 'VALID',
    'filter[expired]': 'false',
    sort: '-uploadedDate',
    limit: '1',
  };
  const { data } = await asc.get(`builds?${query(params)}`, Builds);
  return data[0] ?? null;
}

async function inGroup(asc: Asc, group: BetaGroup, build: TestFlightBuild): Promise<boolean> {
  const params = { 'filter[betaGroups]': group.id, 'filter[id]': build.id, limit: '1' };
  return (await asc.get(`builds?${query(params)}`, Builds)).data.length > 0;
}

async function externalState(asc: Asc, build: TestFlightBuild): Promise<string | null> {
  const { data } = await asc.get(`builds/${build.id}/buildBetaDetail`, Detail);
  return data.attributes.externalBuildState ?? null;
}

/** Whether a build in `state` waits on a Beta App Review submission. */
export const needsReview = (state: string | null) => state === 'READY_FOR_BETA_SUBMISSION';

async function submitForReview(asc: Asc, build: TestFlightBuild): Promise<Delivery['review']> {
  const body = {
    data: {
      type: 'betaAppReviewSubmissions',
      relationships: { build: { data: { type: 'builds', id: build.id } } },
    },
  };
  try {
    await asc.post('betaAppReviewSubmissions', body);
    return 'submitted';
  } catch (error) {
    if (error instanceof AscError && error.status < 500) {
      console.log(
        `::warning::Beta App Review refused build ${build.attributes.version}: ${error.detail}`,
      );
      return 'refused';
    }
    throw error;
  }
}

/**
 * Puts the newest build of `platform` in `group` and sends it to Beta App
 * Review when it waits on one. A build already there is left alone, so a run
 * with nothing new changes nothing.
 */
export async function feed(
  asc: Asc,
  target: { app: string; group: BetaGroup },
  platform: Platform,
) {
  const build = await newestBuild(asc, target.app, platform);
  if (!build) {
    return {
      platform,
      build: null,
      added: false,
      review: 'not needed',
      state: null,
    } satisfies Delivery;
  }
  const added = !(await inGroup(asc, target.group, build));
  if (added) {
    await asc.post(`betaGroups/${target.group.id}/relationships/builds`, {
      data: [{ type: 'builds', id: build.id }],
    });
  }
  const before = await externalState(asc, build);
  const review = needsReview(before) ? await submitForReview(asc, build) : 'not needed';
  const state = review === 'submitted' ? await externalState(asc, build) : before;
  return { platform, build: build.attributes.version, added, review, state } satisfies Delivery;
}

/**
 * Waits until App Store Connect is processing no build of `app`. Resolves
 * false when `deadline` passes first.
 */
export async function settled(asc: Asc, app: string, deadline: number): Promise<boolean> {
  const params = { 'filter[app]': app, 'filter[processingState]': 'PROCESSING', limit: '1' };
  const poll = async (): Promise<boolean> => {
    if (Date.now() >= deadline) {
      return false;
    }
    const { data } = await asc.get(`builds?${query(params)}`, Builds);
    if (data.length === 0) {
      return true;
    }
    await delay(POLL_MS);
    return poll();
  };
  return poll();
}
