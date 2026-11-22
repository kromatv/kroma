import { parseArgs } from 'node:util';
import { notice, setOutput, summary, warning } from './actions';
import { changedFiles } from './changed-files';
import { readRepo } from './event';
import { type Asc, ascClient } from './testflight/asc-client';
import { readAscKey } from './testflight/asc-token';
import {
  APPS,
  appInputs,
  type Platform,
  reaching,
  readWorkspaces,
  type TestFlightApp,
} from './testflight/app-inputs';
import { appId, type BetaGroup, type GroupWanted, resolveGroup } from './testflight/beta-groups';
import { type Delivery, feed, processed } from './testflight/distribute';
import { lastUpload } from './testflight/last-upload';

const PLATFORMS: readonly Platform[] = ['IOS', 'TV_OS'];
const WAIT_MINUTES = 45;

const USAGE = [
  'usage: bun run ci testflight changed --app mobile|appletv',
  '       bun run ci testflight feed (--group <name> [--create] | --link <public link id>)',
  '                                  [--build <number> --wait IOS --wait TV_OS]',
].join('\n');

const isApp = (name: string | undefined): name is keyof typeof APPS =>
  name !== undefined && name in APPS;

const isPlatform = (name: string): name is Platform => PLATFORMS.some((p) => p === name);

async function filesSince(since: string | null): Promise<string[] | 'all'> {
  if (!since) {
    return 'all';
  }
  const head = process.env.GITHUB_SHA ?? 'HEAD';
  return changedFiles({ kind: 'push', before: since, after: head }, readRepo, since);
}

function report(app: TestFlightApp, since: string | null, hits: string[] | 'all'): void {
  const from = since
    ? `since ${since.slice(0, 9)}, its last TestFlight build`
    : 'with no earlier upload found';
  if (hits !== 'all' && hits.length === 0) {
    summary(`${app.workspace} is unchanged ${from}, so nothing goes to TestFlight.\n`);
    return;
  }
  const listed = hits === 'all' ? '- every file' : hits.slice(0, 20).map((f) => `- \`${f}\``);
  summary([`${app.workspace} changed ${from}:`, '', ...[listed].flat(), ''].join('\n'));
}

async function changed(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { app: { type: 'string' } } });
  if (!isApp(values.app)) {
    throw new Error(USAGE);
  }
  const app = APPS[values.app];
  const since = await lastUpload(readRepo(), app.job);
  const hits = reaching(await filesSince(since), appInputs(app, readWorkspaces()));
  setOutput('changed', hits === 'all' || hits.length > 0);
  report(app, since, hits);
}

function wantedGroup(values: { group?: string; link?: string }): GroupWanted {
  if (values.group && !values.link) {
    return { name: values.group };
  }
  if (values.link && !values.group) {
    return { link: values.link };
  }
  throw new Error(USAGE);
}

function row(d: Delivery): string {
  if (d.build === null) {
    return `| ${d.platform} | none | | |`;
  }
  const group = d.added ? 'added' : 'already there';
  return `| ${d.platform} | ${d.build} | ${group} | ${d.review}, ${d.state ?? '?'} |`;
}

function table(group: BetaGroup, deliveries: Delivery[]): string {
  const link = group.attributes.publicLink ?? 'no public link';
  const head = [`### TestFlight: ${group.attributes.name} (${link})`, ''];
  const columns = ['| platform | build | group | review |', '|---|---|---|---|'];
  return [...head, ...columns, ...deliveries.map(row), ''].join('\n');
}

async function waitForBuilds(
  asc: Asc,
  app: string,
  wait: { build: string | undefined; platforms: string[] },
): Promise<void> {
  if (wait.platforms.length === 0) {
    return;
  }
  if (!wait.build) {
    throw new Error(USAGE);
  }
  const version = wait.build;
  const deadline = Date.now() + WAIT_MINUTES * 60_000;
  const waiting = wait.platforms.filter(isPlatform).map(async (platform) => {
    if (!(await processed(asc, { app, platform, version }, deadline))) {
      warning(`${platform} build ${version} was not processed in ${WAIT_MINUTES} minutes`);
    }
  });
  await Promise.all(waiting);
}

async function feedGroup(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      group: { type: 'string' },
      link: { type: 'string' },
      create: { type: 'boolean', default: false },
      build: { type: 'string' },
      wait: { type: 'string', multiple: true, default: [] },
    },
  });
  const wanted = wantedGroup(values);
  const key = readAscKey();
  if (!key) {
    notice('No App Store Connect key, so no TestFlight group is fed.');
    return;
  }
  const asc = ascClient(key);
  const app = await appId(asc);
  const group = await resolveGroup(asc, app, { wanted, create: values.create });
  await waitForBuilds(asc, app, { build: values.build, platforms: values.wait });
  const deliveries = await Promise.all(
    PLATFORMS.map((platform) => feed(asc, { app, group }, platform)),
  );
  summary(table(group, deliveries));
}

/** `bun run ci testflight`: whether an Apple app changed, and feeding a TestFlight group. */
export async function main(argv: string[]): Promise<void> {
  const [verb, ...rest] = argv;
  if (verb === 'changed') {
    return changed(rest);
  }
  if (verb === 'feed') {
    return feedGroup(rest);
  }
  throw new Error(USAGE);
}
