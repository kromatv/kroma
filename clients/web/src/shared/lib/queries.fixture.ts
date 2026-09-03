import { beforeEach, vi } from 'vitest';

const endpoint = () => vi.fn();

const BASE_URL = 'http://kroma.test';

const domains = {
  media: {
    movies: endpoint(),
    shows: endpoint(),
    show: endpoint(),
    item: endpoint(),
    featured: endpoint(),
    similar: endpoint(),
    people: endpoint(),
    person: endpoint(),
    home: endpoint(),
    health: endpoint(),
    splash: endpoint(),
  },
  playback: {
    progress: endpoint(),
    continueWatching: endpoint(),
    upNext: endpoint(),
    following: endpoint(),
  },
  discovery: { detail: endpoint(), trending: endpoint() },
  requests: { list: endpoint(), calendar: endpoint(), missing: endpoint() },
  accounts: { sessions: endpoint(), passkeys: { list: endpoint() } },
  notifications: { list: endpoint(), prefs: endpoint(), push: { key: endpoint() } },
};

type Endpoint = (...args: unknown[]) => unknown;
type Namespace = { [name: string]: Endpoint | Namespace };
interface Options {
  queryKey: unknown[];
  queryFn: () => unknown;
}
type QueryNamespace = { [name: string]: ((...args: unknown[]) => Options) | QueryNamespace };

function queriesOf(node: Namespace, path: readonly string[]): QueryNamespace {
  const tree: QueryNamespace = {};
  for (const [name, member] of Object.entries(node)) {
    const here = [...path, name];
    tree[name] =
      typeof member === 'function'
        ? (...args: unknown[]) => ({
            queryKey: ['kroma', BASE_URL, ...here, ...args],
            queryFn: () => member(...args),
          })
        : queriesOf(member, here);
  }
  return tree;
}

export const c = { ...domains, query: queriesOf(domains, []) };

// biome-ignore lint/suspicious/noExplicitAny: the options are heterogeneous by design
export async function run(opts: any) {
  return await opts.queryFn({});
}

export function show(id: string, genres: string[] = [], tmdbId: number | null = null) {
  return { id, metadata: { genres, tmdbId } };
}

/** Registers the per-test reset every `queries` suite shares. */
export function installHarness(): void {
  beforeEach(() => {
    vi.resetAllMocks();
    c.media.shows.mockResolvedValue([]);
    c.playback.upNext.mockResolvedValue(null);
    c.discovery.detail.mockResolvedValue(null);
    c.playback.following.mockResolvedValue([]);
  });
}
