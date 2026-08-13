// Media requests: submit (Overseerr-style ask for a title), track your own,
// and moderate the queue (approve / deny / interactive release search) with
// `requests.manage`.

import type {
  CalendarEntry,
  CreateRequestBody,
  GrabBody,
  InteractiveSearchView,
  MediaRequest,
  RequestCoverageBody,
  RequestLedgerView,
  RequestsView,
  SearchScope,
  SeasonLedgerView,
  WantedEntry,
} from '../types';
import { JSON_HEADERS, type RequestContext } from './base';

/** Own requests, or everyone's for a `requests.manage` holder. Pass
 * `mine: true` to force own-only (the user-facing "Mes demandes" page). */
export function listRequests(
  ctx: RequestContext,
  opts?: { mine?: boolean },
): Promise<RequestsView> {
  const qs = opts?.mine ? '?mine=true' : '';
  return ctx.json<RequestsView>(`/requests${qs}`);
}

/** The "coming soon" calendar: upcoming, not-yet-available releases (a movie's
 * availability date + a show episode's air date), ascending by date. `mine: true`
 * forces own-only (the user-facing page); a manager otherwise sees everyone's. */
export function getCalendar(
  ctx: RequestContext,
  opts?: { mine?: boolean },
): Promise<CalendarEntry[]> {
  const qs = opts?.mine ? '?mine=true' : '';
  return ctx.json<CalendarEntry[]>(`/requests/calendar${qs}`);
}

/** The "missing / wanted" list: aired/released items still not on disk (the
 * inverse of the calendar), for the Wanted view. `mine: true` forces own-only. */
export function getMissing(
  ctx: RequestContext,
  opts?: { mine?: boolean },
): Promise<CalendarEntry[]> {
  const qs = opts?.mine ? '?mine=true' : '';
  return ctx.json<CalendarEntry[]>(`/requests/missing${qs}`);
}

/** "Search all missing" (requests.manage): kick the acquisition search pass now,
 * which auto-grabs the best release for every aired-but-open item. Returns the
 * job run id. */
export function searchAllMissing(ctx: RequestContext): Promise<{ runId: string }> {
  return ctx.json<{ runId: string }>('/requests/search-missing', { method: 'POST' });
}

/** Per-title "ask to watch" (requests.manage): search this one request and grab
 * the best accepted release. Slow (a live indexer sweep). */
export function autoSearchRequest(
  ctx: RequestContext,
  id: string,
): Promise<{ grabbed: boolean; title?: string }> {
  return ctx.json<{ grabbed: boolean; title?: string }>(
    `/requests/${encodeURIComponent(id)}/auto-search`,
    { method: 'POST' },
  );
}

/** Submit a request. A second ask for the same title merges into the open one
 * (a show ask can widen its season subset). */
export function createRequest(ctx: RequestContext, body: CreateRequestBody): Promise<MediaRequest> {
  return ctx.json<MediaRequest>('/requests', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/** Withdraw an own pending request, or (as a manager) delete any request. */
export function deleteRequest(ctx: RequestContext, id: string): Promise<void> {
  return ctx.json<void>(`/requests/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Approve (requests.manage): materializes the wanted list + kicks the search. */
export function approveRequest(ctx: RequestContext, id: string): Promise<MediaRequest> {
  return ctx.json<MediaRequest>(`/requests/${encodeURIComponent(id)}/approve`, { method: 'POST' });
}

/** Deny (requests.manage), with an optional reason shown to the requester. */
export function denyRequest(ctx: RequestContext, id: string, note?: string): Promise<MediaRequest> {
  return ctx.json<MediaRequest>(`/requests/${encodeURIComponent(id)}/deny`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(note ? { note } : {}),
  });
}

/** A request's wanted ledger (requests.manage): every season/episode it covers
 * with its state. What the scope picker offers, since it is what the search can
 * actually be aimed at. */
export function requestWanted(ctx: RequestContext, id: string): Promise<WantedEntry[]> {
  return ctx.json<WantedEntry[]>(`/requests/${encodeURIComponent(id)}/wanted`);
}

/** Set exactly what a show request covers (requests.manage): the whole show
 * (both null), some seasons, some episodes, or a mix. The wanted ledger is
 * reconciled to match -- episodes that stay in scope keep their state -- so this
 * is also how the automatic search pass is told what to hunt for. */
export function setRequestCoverage(
  ctx: RequestContext,
  id: string,
  body: RequestCoverageBody,
): Promise<MediaRequest> {
  return ctx.json<MediaRequest>(`/requests/${encodeURIComponent(id)}/coverage`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/** The requested title as TMDB describes it (requests.manage): every season,
 * with how much of it the request covers and how much the library already
 * holds. Wider than {@link requestWanted}, which only knows the request's own
 * rows -- this is what says which episodes are MISSING. */
export function requestLedger(ctx: RequestContext, id: string): Promise<RequestLedgerView> {
  return ctx.json<RequestLedgerView>(`/requests/${encodeURIComponent(id)}/ledger`);
}

/** One season's episodes from TMDB (requests.manage), flagged against the
 * ledger and the library. Fetched a season at a time: a twenty-season show is
 * one TMDB call per season the admin actually opens. */
export function requestSeasonLedger(
  ctx: RequestContext,
  id: string,
  season: number,
): Promise<SeasonLedgerView> {
  return ctx.json<SeasonLedgerView>(`/requests/${encodeURIComponent(id)}/ledger/${season}`);
}

/** The `?scope=…&season=…&episode=…` a search or grab is narrowed by. */
export function scopeQuery(scope: SearchScope): string {
  const params = new URLSearchParams({ scope: scope.scope });
  if ('season' in scope) params.set('season', String(scope.season));
  if ('episode' in scope) params.set('episode', String(scope.episode));
  return params.toString();
}

/** Interactive search (requests.manage): live sweep of every enabled indexer
 * for this request, narrowed to `scope` (the whole request by default), and
 * returning scored releases + rejects with reasons. Slow (Torznab
 * round-trips); show a spinner. */
const WHOLE_REQUEST: SearchScope = { scope: 'all' };

export function searchReleases(
  ctx: RequestContext,
  id: string,
  scope: SearchScope = WHOLE_REQUEST,
): Promise<InteractiveSearchView> {
  return ctx.json<InteractiveSearchView>(
    `/requests/${encodeURIComponent(id)}/search?${scopeQuery(scope)}`,
  );
}

/** Manually grab one release from the last interactive search. */
export function grabRelease(ctx: RequestContext, id: string, body: GrabBody): Promise<void> {
  return ctx.json<void>(`/requests/${encodeURIComponent(id)}/grab`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}
