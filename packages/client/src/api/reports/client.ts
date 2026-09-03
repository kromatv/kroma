import type { RequestContext } from '../../core/http';
import type { ReportId } from './ids';
import { type CreateReportBody, Report, type ReportQuery, ReportsView } from './schemas';

/** Problem reports (the "signaler un probleme" flow): any user files one on a
 * movie / show / episode; `reports.manage` holders triage the queue. */
export default function reportsApi(ctx: RequestContext) {
  return {
    /** File a problem report. The server resolves + snapshots the subject title
     * (404 when the movie/show/episode is unknown). */
    create: (body: CreateReportBody) => ctx.post('/reports', Report, { body }),

    /** The caller's own reports, newest first. */
    mine: () => ctx.get('/reports/mine', Report.array()),

    /** The admin triage queue (`reports.manage`), filtered + with tallies. */
    list: (query?: ReportQuery) => ctx.get('/admin/reports', ReportsView, { query }),

    resolve: (id: ReportId) => ctx.post('/admin/reports/:id/resolve', Report, { params: { id } }),

    /** Dismiss a report as not actionable. */
    dismiss: (id: ReportId) => ctx.post('/admin/reports/:id/dismiss', Report, { params: { id } }),

    /** Reopen a resolved or dismissed report. */
    reopen: (id: ReportId) => ctx.post('/admin/reports/:id/reopen', Report, { params: { id } }),

    delete: (id: ReportId) => ctx.delete('/admin/reports/:id', { params: { id } }),
  };
}

declare module '../../core/client' {
  interface Domains {
    reports: ReturnType<typeof reportsApi>;
  }
}
