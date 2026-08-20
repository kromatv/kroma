import { beforeEach, vi } from 'vitest';

export interface Client {
  [k: string]: ReturnType<typeof vi.fn>;
  movies: ReturnType<typeof vi.fn>;
  shows: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  item: ReturnType<typeof vi.fn>;
  featured: ReturnType<typeof vi.fn>;
  similar: ReturnType<typeof vi.fn>;
  upNext: ReturnType<typeof vi.fn>;
  discoverDetail: ReturnType<typeof vi.fn>;
  personDetails: ReturnType<typeof vi.fn>;
  followingEpisodes: ReturnType<typeof vi.fn>;
}

export const c: Client = {
  movies: vi.fn(),
  shows: vi.fn(),
  show: vi.fn(),
  item: vi.fn(),
  featured: vi.fn(),
  similar: vi.fn(),
  upNext: vi.fn(),
  discoverDetail: vi.fn(),
  personDetails: vi.fn(),
  followingEpisodes: vi.fn(),
  personCredits: vi.fn(),
  home: vi.fn(),
  continueWatching: vi.fn(),
  progress: vi.fn(),
  listRequests: vi.fn(),
  getCalendar: vi.fn(),
  getMissing: vi.fn(),
  listSessions: vi.fn(),
  listPasskeys: vi.fn(),
  listNotifications: vi.fn(),
  getNotificationPrefs: vi.fn(),
  pushKey: vi.fn(),
  health: vi.fn(),
  splash: vi.fn(),
  discoverTrending: vi.fn(),
};

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
    for (const fn of Object.values(c)) fn.mockReset();
    c.shows.mockResolvedValue([]);
    c.upNext.mockResolvedValue(null);
    c.discoverDetail.mockResolvedValue(null);
    c.followingEpisodes.mockResolvedValue([]);
  });
}
