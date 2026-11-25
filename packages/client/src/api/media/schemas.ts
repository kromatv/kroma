import { z } from 'zod';
import { CastMember, Metadata } from './credits';
import { ItemId, LibraryId, MediaFileId, ShowId } from './ids';
import { AudioAnalysis, Edition, Marker, MediaFile, Tracks, VideoTrack } from './tracks';

export const MediaKind = z.enum(['movie', 'episode', 'video']);
export type MediaKind = z.infer<typeof MediaKind>;

export const LibraryKind = z.enum(['movies', 'shows', 'mixed']);
export type LibraryKind = z.infer<typeof LibraryKind>;

/** One TMDB title offered by the "fix the match" picker. `score` is the
 * matcher's 0..1 confidence against what the filename parsed to. */
export const MatchCandidate = z.object({
  tmdbId: z.number(),
  title: z.string(),
  originalTitle: z.string().nullish(),
  year: z.number().nullish(),
  posterUrl: z.string().nullish(),
  overview: z.string().nullish(),
  rating: z.number().nullish(),
  score: z.number(),
  current: z.boolean(),
});
export type MatchCandidate = z.infer<typeof MatchCandidate>;

/** What a person who manages the library writes by hand about: a film or an
 * episode (`item`), or a show. */
export const TitleKind = z.enum(['item', 'show']);
export type TitleKind = z.infer<typeof TitleKind>;

/** Whose chosen art: a film or an episode (`item`), a show, or a show's season,
 * which takes only a poster. */
export const ArtKind = z.enum(['item', 'show', 'season']);
export type ArtKind = z.infer<typeof ArtKind>;

/** Which of a title's pictures an admin chooses: `still` is an episode's thumbnail. */
export const ArtRole = z.enum(['poster', 'backdrop', 'logo', 'still']);
export type ArtRole = z.infer<typeof ArtRole>;

/** `GET /api/art/{kind}/{id}`: the URL of each picture an admin chose. */
export const ChosenArt = z.object({
  poster: z.string().nullable(),
  backdrop: z.string().nullable(),
  logo: z.string().nullish(),
  still: z.string().nullish(),
});
export type ChosenArt = z.infer<typeof ChosenArt>;

/** `POST /api/art/{kind}/{id}/{role}`: where the chosen picture is served. */
export const ArtShown = z.object({ url: z.string() });
export type ArtShown = z.infer<typeof ArtShown>;

/** `GET` and `PUT /api/edits/{kind}/{id}`: what was written by hand about a
 * film or a show. Each field comes before the provider's in every language,
 * and a null one follows the provider. */
export const TitleEdit = z.object({
  title: z.string().nullable(),
  originalTitle: z.string().nullable().default(null),
  sortTitle: z.string().nullable().default(null),
  tagline: z.string().nullable().default(null),
  overview: z.string().nullable(),
  year: z.number().int().nullable(),
  released: z.string().nullable().default(null),
  genres: z.array(z.string()).nullable(),
});
export type TitleEdit = z.infer<typeof TitleEdit>;

/** What a {@link TitleEdit} can hold, as the server checks it: characters in a
 * name, a tagline, a summary and one genre, how many genres, and the years. */
export const TITLE_EDIT_LIMITS = {
  title: 300,
  tagline: 300,
  overview: 10_000,
  genre: 60,
  genres: 20,
  years: [1800, 2200],
} as const;

/** Route vocabulary for a rematch: the catalog's split, not TMDB's `tv`. */
export const RematchKind = z.enum(['movie', 'show']);
export type RematchKind = z.infer<typeof RematchKind>;

/** `GET /api/rematch/{kind}/{id}/candidates`. `pinned` means an operator chose
 * the current match, so there is a pin to reset. */
export const MatchCandidates = z.object({
  query: z.string(),
  year: z.number().nullish(),
  currentTmdbId: z.number().nullish(),
  pinned: z.boolean(),
  results: z.array(MatchCandidate),
});
export type MatchCandidates = z.infer<typeof MatchCandidates>;

const CatalogEntry = z.object({
  title: z.string(),
  year: z.number().nullable(),
  library: LibraryId,
  video: VideoTrack.nullable(),
  addedAt: z.string(),
  metadata: Metadata.nullish(),
});

/** `files` arrives ranked best-first, so `files[0]` is the preferred file of the
 * preferred edition and `defaultFileId` names it. `editions` lists the cuts those
 * files realise, the preferred one first; every file names exactly one of them in
 * `editionId`. */
export const MediaItem = CatalogEntry.extend(Tracks.shape).extend({
  id: ItemId,
  kind: MediaKind,
  showId: ShowId.nullable(),
  showTitle: z.string().nullable(),
  season: z.number().nullable(),
  episode: z.number().nullable(),
  episodeEnd: z.number().nullable(),
  episodeTitle: z.string().nullable(),
  files: z.array(MediaFile),
  editions: z.array(Edition).default([]),
  defaultFileId: MediaFileId.nullish(),
  markers: z.array(Marker).nullish(),
  audioAnalysis: AudioAnalysis.nullish(),
});
export type MediaItem = z.infer<typeof MediaItem>;

/** The languages a title can be heard and read in, across every file it has,
 * each in the spelling a file wrote it (`fre`, `en`): fold them with `langBase`.
 * Optional, so a full item is still a card. */
const TrackLanguages = z.object({
  audioLanguages: z.array(z.string()).optional(),
  subtitleLanguages: z.array(z.string()).optional(),
});

/** A movie as a list draws it (`GET /api/movies?view=card`): what a grid sorts,
 * filters and paints, without the files, tracks, cast and crew only its own page
 * reads. Every `MediaItem` is one. `showId` is present only on an episode. */
export const MediaCard = MediaItem.pick({
  id: true,
  title: true,
  kind: true,
  year: true,
  durationMs: true,
  video: true,
  library: true,
  addedAt: true,
  metadata: true,
})
  .extend({ showId: ShowId.nullish() })
  .extend(TrackLanguages.shape);
export type MediaCard = z.infer<typeof MediaCard>;

/** An episode the provider lists that the library does not hold: enough to show
 * the gap with a title, a still and the day it airs. */
export const ListedEpisode = z.object({
  episode: z.number(),
  title: z.string().nullish(),
  overview: z.string().nullish(),
  airDate: z.string().nullish(),
  stillUrl: z.string().nullish(),
});
export type ListedEpisode = z.infer<typeof ListedEpisode>;

/** Episodes are sorted by episode number; `missing` holds the listed episodes
 * not on disk, in the same order. */
export const Season = z.object({
  number: z.number(),
  episodes: z.array(MediaItem),
  posterUrl: z.string().nullish(),
  cast: z.array(CastMember).nullish(),
  missing: z.array(ListedEpisode).nullish(),
});
export type Season = z.infer<typeof Season>;

/** A TV show aggregate (not a file), built by grouping episodes during a scan. */
export const Show = CatalogEntry.extend({
  id: ShowId,
  seasonCount: z.number(),
  episodeCount: z.number(),
  progress: z.number().nullish(),
});
export type Show = z.infer<typeof Show>;

/** A show as the Series grid draws it (`GET /api/shows?view=card`): without cast
 * or crew, with the languages its episodes are heard and read in, and in
 * `episodeLanguages` each episode's own, listed once per set of languages. */
export const ShowCard = Show.extend(TrackLanguages.shape).extend({
  episodeLanguages: z.array(TrackLanguages).optional(),
});
export type ShowCard = z.infer<typeof ShowCard>;

/** `GET /api/shows/:id`. */
export const ShowDetail = z.object({
  show: Show,
  seasons: z.array(Season),
});
export type ShowDetail = z.infer<typeof ShowDetail>;

export const Library = z.object({
  id: LibraryId,
  name: z.string(),
  kind: LibraryKind,
  path: z.string(),
  itemCount: z.number(),
});
export type Library = z.infer<typeof Library>;

const Resume = z.object({
  positionMs: z.number(),
  durationMs: z.number().nullable(),
  updatedAt: z.string(),
});

export const ProgressEntry = Resume.extend({ itemId: ItemId });
export type ProgressEntry = z.infer<typeof ProgressEntry>;

export const ContinueItem = Resume.extend({ item: MediaItem });
export type ContinueItem = z.infer<typeof ContinueItem>;

/** `GET /api/shows/:id/up-next`. */
export const UpNext = z.object({
  item: MediaItem,
  resume: z.boolean(),
});
export type UpNext = z.infer<typeof UpNext>;

export const MovieHit = z.object({ type: z.literal('movie'), item: MediaItem });
export const ShowHit = z.object({ type: z.literal('show'), show: Show });
export const EpisodeHit = z.object({ type: z.literal('episode'), item: MediaItem });

export const SectionItem = z.discriminatedUnion('type', [MovieHit, ShowHit]);
export type SectionItem = z.infer<typeof SectionItem>;

/** How a home section asks to be drawn. A layout this client does not know
 * reads as a rail, which is how the server serves it to a client that did not
 * ask for it. */
export const SectionLayout = z
  .enum(['rail', 'wide', 'ranked', 'spotlight', 'hero'])
  .default('rail')
  .catch('rail');
export type SectionLayout = z.infer<typeof SectionLayout>;

/** The layouts a client can name in `?layouts=`: everything but the rail every
 * client draws. */
export type SectionLayoutRequest = Exclude<SectionLayout, 'rail'>;

const SectionRail = z.object({
  id: z.string(),
  title: z.string(),
  reason: z.string().nullish(),
  layout: SectionLayout,
  notes: z.record(z.string(), z.string()).default({}),
});

export const Section = SectionRail.extend({ items: z.array(SectionItem) });
export type Section = z.infer<typeof Section>;

const SectionCard = z.discriminatedUnion('type', [
  z.object({ type: z.literal('movie'), item: MediaCard }),
  ShowHit,
]);

/** A home rail as a poster grid draws it (`GET /api/home?view=card`): a movie
 * is its `MediaCard`, a show keeps its shape without cast or crew. */
export const CardSection = SectionRail.extend({ items: z.array(SectionCard) });
export type CardSection = z.infer<typeof CardSection>;

/** `GET /api/health`. */
export const Health = z.object({
  status: z.string(),
  name: z.string().optional(),
  instanceId: z.string().optional(),
  bootId: z.string().optional(),
  version: z.string(),
  /** The oldest app version this server serves. Absent on a server from
   * before it said. */
  minClient: z.string().optional(),
  build: z.number().optional(),
  commit: z.string().optional(),
  ffprobe: z.boolean(),
  libraries: z.number(),
  items: z.number(),
  shows: z.number(),
  updateChannel: z.string().optional(),
});
export type Health = z.infer<typeof Health>;

/** `GET /api/splash`: one cover of the anonymous sign-in slideshow. */
export const SplashEntry = z.object({
  kind: z.string(),
  title: z.string(),
  year: z.number().nullable(),
  backdropUrl: z.string(),
  rating: z.number().nullish(),
  posterUrl: z.string().nullish(),
  trending: z.boolean().default(false),
});
export type SplashEntry = z.infer<typeof SplashEntry>;

export const ServerInfo = z.object({
  name: z.string(),
  hostname: z.string(),
  version: z.string(),
  uptimeSec: z.number(),
  online: z.boolean(),
  sessions: z.number(),
});
export type ServerInfo = z.infer<typeof ServerInfo>;
