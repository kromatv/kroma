import { z } from 'zod';
import type { RequestContext } from '../../core/client';
import { type RequestKind, RequestLedgerView, SeasonLedgerView } from '../requests';
import {
  BulkMonitorResult,
  type EpisodeMonitoringBody,
  type MonitorBody,
  MonitoredSummary,
  MonitoredTitle,
  type TitleRef,
} from './schemas';

const Removed = z.object({ ok: z.boolean() });

/** Monitoring (`library.manage`): the titles the server wants to hold, Sonarr
 * and Radarr's model. A monitored movie is searched once available; a
 * monitored show is searched episode by episode. */
export default function monitoringApi(ctx: RequestContext) {
  const title = (kind: RequestKind, tmdbId: number) => ({ params: { kind, tmdbId } });
  return {
    /** Every monitored title with what the library holds of it. */
    list: () => ctx.get('/monitoring', MonitoredSummary.array()),

    /** How a title is monitored; a 404 when it is not. */
    get: (kind: RequestKind, tmdbId: number) =>
      ctx.get('/monitoring/:kind/:tmdbId', MonitoredTitle, title(kind, tmdbId)),

    /** Monitor a title, or change how. A preset re-chooses a show's episodes. */
    monitor: (kind: RequestKind, tmdbId: number, body: MonitorBody = {}) =>
      ctx.put('/monitoring/:kind/:tmdbId', MonitoredTitle, { ...title(kind, tmdbId), body }),

    /** Stop monitoring a title: its rows go with it, requests stay. */
    unmonitor: (kind: RequestKind, tmdbId: number) =>
      ctx.delete('/monitoring/:kind/:tmdbId', Removed, title(kind, tmdbId)),

    /** Switch whole seasons and single episodes of a monitored show. */
    setEpisodes: (tmdbId: number, body: EpisodeMonitoringBody) =>
      ctx.put('/monitoring/:kind/:tmdbId/episodes', MonitoredTitle, {
        ...title('show', tmdbId),
        body,
      }),

    /** The same settings for many titles at once (at most 500). */
    bulk: (titles: TitleRef[], body: MonitorBody = {}) =>
      ctx.post('/monitoring/bulk', BulkMonitorResult, { body: { titles, ...body } }),

    /** The title as TMDB knows it, against every row it has and the library. */
    ledger: (kind: RequestKind, tmdbId: number) =>
      ctx.get('/monitoring/:kind/:tmdbId/ledger', RequestLedgerView, title(kind, tmdbId)),

    /** One season's episodes, flagged with which are monitored and on disk. */
    seasonLedger: (tmdbId: number, season: number) =>
      ctx.get('/monitoring/:kind/:tmdbId/ledger/:season', SeasonLedgerView, {
        params: { kind: 'show', tmdbId, season },
      }),
  };
}

declare module '../../core/client' {
  interface Domains {
    monitoring: ReturnType<typeof monitoringApi>;
  }
}
