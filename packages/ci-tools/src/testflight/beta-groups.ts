import { z } from 'zod';
import type { Asc } from './asc-client';

const BUNDLE_ID = 'tv.kroma.app';

const Apps = z.object({
  data: z.array(z.object({ id: z.string(), attributes: z.object({ bundleId: z.string() }) })),
});

const Group = z.object({
  id: z.string(),
  attributes: z.object({
    name: z.string(),
    isInternalGroup: z.boolean(),
    publicLinkEnabled: z.boolean().nullish(),
    publicLinkId: z.string().nullish(),
    publicLink: z.string().nullish(),
  }),
});

/** A TestFlight group as App Store Connect lists it. */
export type BetaGroup = z.infer<typeof Group>;

/** Which group to feed: the external group behind a public link, or one by name. */
export type GroupWanted = { link: string } | { name: string };

/** The App Store Connect id of the app record `tv.kroma.app` belongs to. */
export async function appId(asc: Asc): Promise<string> {
  const { data } = await asc.get(`apps?filter[bundleId]=${BUNDLE_ID}`, Apps);
  const app = data.find((a) => a.attributes.bundleId === BUNDLE_ID);
  if (!app) {
    throw new Error(`App Store Connect has no app with the bundle id ${BUNDLE_ID}`);
  }
  return app.id;
}

/** The external group `wanted` names, or undefined. */
export function pickGroup(
  groups: readonly BetaGroup[],
  wanted: GroupWanted,
): BetaGroup | undefined {
  const external = groups.filter((g) => !g.attributes.isInternalGroup);
  if ('link' in wanted) {
    return external.find((g) => g.attributes.publicLinkId === wanted.link);
  }
  return external.find((g) => g.attributes.name === wanted.name);
}

async function createGroup(asc: Asc, app: string, name: string): Promise<BetaGroup> {
  const body = {
    data: {
      type: 'betaGroups',
      attributes: { name, publicLinkEnabled: true, feedbackEnabled: true },
      relationships: { app: { data: { type: 'apps', id: app } } },
    },
  };
  return (await asc.create('betaGroups', body, z.object({ data: Group }))).data;
}

/**
 * The group `wanted` names. A group wanted by name is created, with its
 * public link on, when `create` is set and the app has none of that name.
 */
export async function resolveGroup(
  asc: Asc,
  app: string,
  options: { wanted: GroupWanted; create: boolean },
): Promise<BetaGroup> {
  const { data } = await asc.get(
    `apps/${app}/betaGroups?limit=200`,
    z.object({ data: z.array(Group) }),
  );
  const found = pickGroup(data, options.wanted);
  if (found) {
    return found;
  }
  if ('link' in options.wanted || !options.create) {
    throw new Error(`no external TestFlight group matches ${JSON.stringify(options.wanted)}`);
  }
  return createGroup(asc, app, options.wanted.name);
}
