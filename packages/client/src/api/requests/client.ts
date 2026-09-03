import { z } from 'zod';
import type { RequestContext } from '../../core/client';
import { JobStarted } from '../jobs';
import {
  type GrabBody,
  InteractiveSearchView,
  RequestLedgerView,
  type SearchScope,
  SeasonLedgerView,
  WantedEntry,
} from './acquisition';
import type { RequestId } from './ids';
import {
  CalendarEntry,
  type CreateRequestBody,
  MediaRequest,
  type RequestCoverage,
  RequestsView,
} from './schemas';

const AutoSearchResult = z.object({ grabbed: z.boolean(), title: z.string().optional() });

const WHOLE_REQUEST: SearchScope = { scope: 'all' };

/** Media requests: submit (an Overseerr-style ask for a title), track your own,
 * and moderate the queue with `requests.manage`. */
export default function requestsApi(ctx: RequestContext) {
  return {
    /** Own requests, or everyone's for a `requests.manage` holder. `mine: true`
     * forces own-only (the user-facing "Mes demandes" page). */
    list: (opts?: { mine?: boolean }) =>
      ctx.get('/requests', RequestsView, { query: { mine: opts?.mine } }),

    /** The "coming soon" calendar: upcoming, not-yet-available releases, oldest
     * date first. `mine: true` forces own-only. */
    calendar: (opts?: { mine?: boolean }) =>
      ctx.get('/requests/calendar', CalendarEntry.array(), { query: { mine: opts?.mine } }),

    /** The "missing / wanted" list: aired or released items still not on disk,
     * the inverse of the calendar. `mine: true` forces own-only. */
    missing: (opts?: { mine?: boolean }) =>
      ctx.get('/requests/missing', CalendarEntry.array(), { query: { mine: opts?.mine } }),

    /** Kick the acquisition search pass now (requests.manage), auto-grabbing the
     * best release for every aired-but-open item. */
    searchAllMissing: () => ctx.post('/requests/search-missing', JobStarted),

    /** Search this one request and grab the best accepted release
     * (requests.manage). Slow: a live indexer sweep. */
    autoSearch: (id: RequestId) =>
      ctx.post('/requests/:id/auto-search', AutoSearchResult, { params: { id } }),

    /** Submit a request. A second ask for the same title merges into the open
     * one (a show ask can widen its season subset). */
    create: (body: CreateRequestBody) => ctx.post('/requests', MediaRequest, { body }),

    /** Withdraw an own pending request, or (as a manager) delete any request. */
    delete: (id: RequestId) => ctx.delete('/requests/:id', { params: { id } }),

    /** Approve (requests.manage): materializes the wanted list, kicks the search. */
    approve: (id: RequestId) => ctx.post('/requests/:id/approve', MediaRequest, { params: { id } }),

    /** Deny (requests.manage), with an optional reason shown to the requester. */
    deny: (id: RequestId, note?: string) =>
      ctx.post('/requests/:id/deny', MediaRequest, { params: { id }, body: note ? { note } : {} }),

    /** A request's wanted ledger (requests.manage): every season/episode it
     * covers with its state, which is what a search can be aimed at. */
    wanted: (id: RequestId) =>
      ctx.get('/requests/:id/wanted', WantedEntry.array(), { params: { id } }),

    /** Set exactly what a show request covers (requests.manage): the whole show
     * (both null), some seasons, some episodes, or a mix. The wanted ledger is
     * reconciled to match, episodes that stay in scope keeping their state, so
     * this is also how the automatic search pass is told what to hunt for. */
    setCoverage: (id: RequestId, body: RequestCoverage) =>
      ctx.put('/requests/:id/coverage', MediaRequest, { params: { id }, body }),

    /** The requested title as TMDB describes it (requests.manage): every season,
     * with how much of it the request covers and how much the library holds.
     * Wider than `wanted`, which only knows the request's own rows; this is what
     * says which episodes are MISSING. */
    ledger: (id: RequestId) =>
      ctx.get('/requests/:id/ledger', RequestLedgerView, { params: { id } }),

    /** One season's episodes from TMDB (requests.manage), flagged against the
     * ledger and the library. Fetched a season at a time: a twenty-season show
     * is one TMDB call per season the admin actually opens. */
    seasonLedger: (id: RequestId, season: number) =>
      ctx.get('/requests/:id/ledger/:season', SeasonLedgerView, { params: { id, season } }),

    /** Interactive search (requests.manage): a live sweep of every enabled
     * indexer for this request, narrowed to `scope` (the whole request by
     * default), returning scored releases and rejects with reasons. Slow. */
    searchReleases: (id: RequestId, scope: SearchScope = WHOLE_REQUEST) =>
      ctx.get('/requests/:id/search', InteractiveSearchView, {
        params: { id },
        query: { ...scope },
      }),

    /** Manually grab one release from the last interactive search. */
    grab: (id: RequestId, body: GrabBody) =>
      ctx.post('/requests/:id/grab', { params: { id }, body }),
  };
}

declare module '../../core/client' {
  interface Domains {
    requests: ReturnType<typeof requestsApi>;
  }
}
