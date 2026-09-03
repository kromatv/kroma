import { SessionResult, User } from '@kroma/client/accounts';
import { MediaItem } from '@kroma/client/media';
import type { Page } from 'playwright';

const USER = User.parse({
  id: 'probe-user',
  email: 'probe@kroma.local',
  username: 'Probe',
  permissions: ['playback'],
  createdAt: '2026-01-01T00:00:00Z',
  hasPin: false,
});

const SESSION = SessionResult.parse({ token: 'probe-bearer', user: USER });

function movie(at: number): MediaItem {
  return MediaItem.parse({
    id: at.toString(16).padStart(16, '0'),
    title: `Film ${at}`,
    kind: 'movie',
    year: 2000 + (at % 24),
    durationMs: 7_200_000,
    container: 'mkv',
    video: null,
    audio: null,
    audioTracks: [],
    subtitles: [],
    library: 'Films',
    showId: null,
    showTitle: null,
    season: null,
    episode: null,
    episodeEnd: null,
    episodeTitle: null,
    relPath: null,
    addedAt: '2026-01-01T00:00:00Z',
    metadata: null,
    files: [],
    defaultFileId: null,
  });
}

const EMPTY_LISTS = new Set(['/shows', '/continue', '/watched', '/my-list', '/home']);

function payload(path: string, movies: readonly MediaItem[]): unknown {
  if (path === '/auth/token') return SESSION;
  if (path === '/movies') return movies;
  if (path === '/home/featured') return null;
  if (EMPTY_LISTS.has(path)) return [];
  return {};
}

export function catalogue(items: number): MediaItem[] {
  return Array.from({ length: items }, (_, at) => movie(at));
}

interface Answer {
  status: number;
  contentType: string;
  body: string;
}

/** What the stub answers for an `/api/*` URL. `/movies` is the only populated
 * catalogue; everything else answers empty rather than 404, so a run measures
 * the app and never a server. */
export function answer(url: string, movies: readonly MediaItem[]): Answer {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(payload(new URL(url).pathname.replace(/^\/api/, ''), movies)),
  };
}

export async function stubApi(page: Page, movies: readonly MediaItem[]): Promise<void> {
  await page.route('**/api/**', (route) => route.fulfill(answer(route.request().url(), movies)));
}

/** The localStorage a signed-in television boots from, in the language the run
 * will be read in. `lastUsedAt` is what marks a saved server active: without it
 * the app opens on the profile picker and never reaches a screen. */
export function deviceEntries(serverUrl: string, locale: string): Record<string, string> {
  const account = { serverUrl, accessToken: 'probe-access', user: USER };
  return {
    'kroma.session': JSON.stringify(account),
    'kroma.accounts': JSON.stringify([account]),
    'kroma.servers': JSON.stringify([{ url: serverUrl, name: 'probe', lastUsedAt: Date.now() }]),
    'kroma.locale': locale,
  };
}

// The brand intro is an overlay over an app tree that is already mounted, so a
// run that does not skip it drives the D-pad against a splash screen.
export const SESSION_ENTRIES: Record<string, string> = { 'kroma:intro-seen': '1' };
