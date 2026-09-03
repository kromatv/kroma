import { z } from 'zod';
import { UserId } from '../accounts';
import { RequestId } from './ids';

export const RequestKind = z.enum(['movie', 'show']);
export type RequestKind = z.infer<typeof RequestKind>;

export const RequestStatus = z.enum([
  'pending',
  'approved',
  'searching',
  'downloading',
  'importing',
  'available',
  'partially_available',
  'failed',
  'denied',
]);
export type RequestStatus = z.infer<typeof RequestStatus>;

export const RequestCounts = z.object({
  total: z.number(),
  pending: z.number(),
  active: z.number(),
  available: z.number(),
  denied: z.number(),
  failed: z.number(),
});
export type RequestCounts = z.infer<typeof RequestCounts>;

export const EpisodeRef = z.object({
  season: z.number(),
  episode: z.number(),
});
export type EpisodeRef = z.infer<typeof EpisodeRef>;

/** What a show request covers: the union of whole `seasons` and individual
 * `episodes`; both null means the whole show. Also the `PUT
 * /api/requests/:id/coverage` body, which is the same shape said forwards:
 * unlike a second ask, it can narrow as well as widen. */
export const RequestCoverage = z.object({
  seasons: z.array(z.number()).nullable(),
  episodes: z.array(EpisodeRef).nullable(),
});
export type RequestCoverage = z.infer<typeof RequestCoverage>;

export const MediaRequest = RequestCoverage.extend({
  id: RequestId,
  kind: RequestKind,
  tmdbId: z.number(),
  title: z.string(),
  year: z.number().nullable(),
  posterUrl: z.string().nullable(),
  status: RequestStatus,
  requestedBy: UserId.nullable(),
  requestedByName: z.string().nullable(),
  reviewedBy: UserId.nullable(),
  note: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  progress: z.number().nullable(),
  airStatus: z.string().nullable(),
  nextAirDate: z.string().nullable(),
});
export type MediaRequest = z.infer<typeof MediaRequest>;

/** `GET /api/requests`. */
export const RequestsView = z.object({
  requests: z.array(MediaRequest),
  counts: RequestCounts,
});
export type RequestsView = z.infer<typeof RequestsView>;

/** Shared by `GET /api/requests/calendar` (future-dated, `airDate` always set)
 * and `GET /api/requests/missing` (aired but not on disk, `airDate` may be
 * null). `requestId` is null for a library-scan row nobody requested. */
export const CalendarEntry = z.object({
  requestId: RequestId.nullable(),
  tmdbId: z.number(),
  kind: RequestKind,
  title: z.string(),
  year: z.number().nullable(),
  posterUrl: z.string().nullable(),
  season: z.number().nullable(),
  episode: z.number().nullable(),
  airDate: z.string().nullable(),
  status: z.string(),
});
export type CalendarEntry = z.infer<typeof CalendarEntry>;

/** `POST /api/requests` body. */
export const CreateRequestBody = z.object({
  kind: RequestKind,
  tmdbId: z.number(),
  seasons: z.array(z.number()).nullable(),
  episodes: z.array(EpisodeRef).nullish(),
});
export type CreateRequestBody = z.infer<typeof CreateRequestBody>;
