import { z } from 'zod';
import { ItemId, ShowId } from '../media';
import { JobKey, JobRunId } from '../jobs';
import { ReportId, ReportStatus, ReportSubjectKind } from '../reports';
import { RequestId, RequestKind, RequestStatus } from '../requests';
import type { Notification } from './schemas';

/** `request.submitted` · `request.approved` · `request.denied` ·
 * `request.available`. */
export const RequestEventData = z.object({
  requestId: RequestId,
  kind: RequestKind,
  tmdbId: z.number(),
  status: RequestStatus,
});
export type RequestEventData = z.infer<typeof RequestEventData>;

/** `media.added`. `itemId` is present only when the run announced one title. */
export const MediaAddedData = z.object({
  count: z.number(),
  itemId: ItemId.optional(),
});
export type MediaAddedData = z.infer<typeof MediaAddedData>;

/** `media.episode`. `season` and `episode` are present only when the run
 * announced one episode rather than a season drop. */
export const MediaEpisodeData = z.object({
  showId: ShowId,
  count: z.number(),
  season: z.number().optional(),
  episode: z.number().optional(),
});
export type MediaEpisodeData = z.infer<typeof MediaEpisodeData>;

/** `report.submitted` · `report.resolved` · `report.dismissed`. */
export const ReportEventData = z.object({
  reportId: ReportId,
  subjectKind: ReportSubjectKind,
  subjectId: z.string(),
  status: ReportStatus,
});
export type ReportEventData = z.infer<typeof ReportEventData>;

/** `system.job.failed`. */
export const JobFailedData = z.object({ job: JobKey, runId: JobRunId });
export type JobFailedData = z.infer<typeof JobFailedData>;

const BY_EVENT = {
  'request.submitted': RequestEventData,
  'request.approved': RequestEventData,
  'request.denied': RequestEventData,
  'request.available': RequestEventData,
  'media.added': MediaAddedData,
  'media.episode': MediaEpisodeData,
  'report.submitted': ReportEventData,
  'report.resolved': ReportEventData,
  'report.dismissed': ReportEventData,
  'system.job.failed': JobFailedData,
} as const satisfies Record<string, z.ZodType>;

/** The events whose `data` this client knows how to read. */
export type EventWithData = keyof typeof BY_EVENT;

/**
 * The facts a notification carries, parsed against the schema its event names.
 * `undefined` for an event this client does not know, for a row written before
 * the server sent `data`, and for an object that does not match the schema: an
 * unreadable payload is dropped, never passed on half-parsed.
 */
export function notificationData<E extends EventWithData>(
  notification: Notification & { event: E },
): z.infer<(typeof BY_EVENT)[E]> | undefined;
export function notificationData(notification: Notification): unknown;
export function notificationData(notification: Notification): unknown {
  const schema: z.ZodType | undefined = BY_EVENT[notification.event as EventWithData];
  if (!schema || !notification.data) return undefined;
  return schema.safeParse(notification.data).data;
}
