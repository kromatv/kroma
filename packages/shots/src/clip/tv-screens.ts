import { z } from 'zod';
import type { SweepAccount } from './account';
import { callApi } from './api';
import { Titled } from './schemas';

/** One entry of the TV router's stack, as `sessionStorage['kroma:dev-nav']`
 *  holds it: a `RouteName` of `packages/tv/src/app/router.tsx` and its params. */
export interface TvEntry {
  name: string;
  params?: object;
}

/** A screen of the TV app, and the stack that lands on it over home. */
export interface TvScreen {
  label: string;
  stack: readonly TvEntry[];
}

/** A movie and a show of the library, for the two detail screens. */
export interface Samples {
  movie: Titled | undefined;
  show: Titled | undefined;
}

const HOME: TvEntry = { name: 'home' };
const GRID_KINDS = ['films', 'series', 'mylist'] as const;
const PLAIN = ['genres', 'search', 'profileMenu', 'releases'] as const;

const over = (label: string, entry: TvEntry): TvScreen => ({ label, stack: [HOME, entry] });

/** The screens of the TV app a sweep reads: home, the three grids, the genres,
 *  search, the signed-in settings and the release notes, then the detail of
 *  the movie and of the show in `samples` when the library has one. */
export function tvScreens({ movie, show }: Samples): TvScreen[] {
  return [
    { label: 'home', stack: [HOME] },
    ...GRID_KINDS.map((kind) => over(`grid ${kind}`, { name: 'grid', params: { kind } })),
    ...PLAIN.map((name) => over(name, { name })),
    ...(movie ? [over(`movie ${movie.title}`, { name: 'movie', params: { item: movie } })] : []),
    ...(show ? [over(`show ${show.title}`, { name: 'show', params: { show } })] : []),
  ];
}

/** The first movie and the first show the account's library lists. */
export async function librarySamples({ server, token }: SweepAccount): Promise<Samples> {
  const init = { headers: { authorization: `Bearer ${token}` } };
  const [movies, shows] = await Promise.all([
    callApi(`${server}/api/movies?view=card`, Titled.array(), init),
    callApi(`${server}/api/shows`, Titled.array(), init),
  ]);
  return { movie: movies[0], show: shows[0] };
}

const StoredStack = z.array(z.object({ name: z.string() })).nonempty();

/** The route on top of the stack the TV router mirrors to sessionStorage, or
 *  null when there is none to read. */
export function stackTop(stored: string | null): string | null {
  const parsed = StoredStack.safeParse(stored === null ? null : JSON.parse(stored));
  return parsed.success ? (parsed.data.at(-1)?.name ?? null) : null;
}
