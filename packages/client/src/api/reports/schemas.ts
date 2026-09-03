import { z } from 'zod';
import { UserId } from '../accounts';
import { ReportId } from './ids';

/** What a report is filed against (movies + episodes are `items`; a show is its
 * own aggregate). */
export const ReportSubjectKind = z.enum(['movie', 'show', 'episode']);
export type ReportSubjectKind = z.infer<typeof ReportSubjectKind>;

/** The nature of the reported problem. `metadata` = a wrong fiche (title /
 * overview / poster / cast / bad match); `other` carries a free-text message. */
export const ReportCategory = z.enum(['metadata', 'video', 'audio', 'subtitles', 'other']);
export type ReportCategory = z.infer<typeof ReportCategory>;

/** A report's triage state. */
export const ReportStatus = z.enum(['open', 'resolved', 'dismissed']);
export type ReportStatus = z.infer<typeof ReportStatus>;

/** `POST /api/reports` body. The server resolves + snapshots `subjectTitle`. */
export const CreateReportBody = z.object({
  subjectKind: ReportSubjectKind,
  subjectId: z.string(),
  category: ReportCategory,
  message: z.string().nullish(),
});
export type CreateReportBody = z.infer<typeof CreateReportBody>;

/** One problem report, as listed in the admin queue (reporter's name hydrated). */
export const Report = CreateReportBody.extend({
  id: ReportId,
  subjectTitle: z.string(),
  message: z.string().nullable(),
  status: ReportStatus,
  reportedBy: UserId.nullable(),
  reportedByName: z.string().nullable(),
  resolvedBy: UserId.nullable(),
  resolvedAt: z.number().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Report = z.infer<typeof Report>;

/** Status tallies for the admin queue's filter chips. */
export const ReportCounts = z.object({
  total: z.number(),
  open: z.number(),
  resolved: z.number(),
  dismissed: z.number(),
});
export type ReportCounts = z.infer<typeof ReportCounts>;

/** `GET /api/admin/reports`. */
export const ReportsView = z.object({
  reports: z.array(Report),
  counts: ReportCounts,
});
export type ReportsView = z.infer<typeof ReportsView>;

/** The admin triage queue's filters. */
export const ReportQuery = z.object({
  status: ReportStatus.optional(),
  category: ReportCategory.optional(),
  kind: ReportSubjectKind.optional(),
  q: z.string().optional(),
});
export type ReportQuery = z.infer<typeof ReportQuery>;
