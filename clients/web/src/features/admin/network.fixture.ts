import type { Flow, Rule, RulesView, SummaryRow } from '@kromatv/client/network';

/** A connection the server let out directly, with `fields` laid over it. */
export function flowOf(fields: Partial<Flow> = {}): Flow {
  return {
    id: 'f-1',
    at: 1_761_820_800_000,
    caller: 'core',
    purpose: 'metadata',
    method: 'GET',
    host: 'api.themoviedb.org',
    port: 443,
    route: 'direct',
    status: 200,
    bytesIn: 1024,
    bytesOut: 256,
    durationMs: 120,
    error: null,
    rule: null,
    ...fields,
  };
}

/** A rule matching everything and sending it direct, with `fields` laid over it. */
export function ruleOf(fields: Partial<Rule> = {}): Rule {
  return {
    id: 'r-1',
    caller: null,
    purpose: null,
    host: null,
    action: 'direct',
    note: null,
    ...fields,
  };
}

/** One allowed group of ten connections to TMDB, with `fields` laid over it. */
export function summaryRowOf(fields: Partial<SummaryRow> = {}): SummaryRow {
  return {
    caller: 'core',
    purpose: 'metadata',
    host: 'api.themoviedb.org',
    route: 'direct',
    verdict: 'allowed',
    count: 10,
    bytesIn: 1000,
    bytesOut: 100,
    lastAt: 1_000,
    ...fields,
  };
}

export const RULES_VIEW: RulesView = {
  defaultAction: 'allow',
  rules: [
    ruleOf({ id: 'r-1', caller: 'tv.kroma.torrents', action: 'vpn' }),
    ruleOf({ id: 'r-2', host: '*.doubleclick.net', action: 'block', note: 'Publicité' }),
  ],
  purposes: [
    { caller: 'core', purpose: 'metadata' },
    { caller: 'core', purpose: 'updates' },
    { caller: 'tv.kroma.torrents', purpose: 'peers' },
    { caller: 'tv.kroma.torrents', purpose: 'trackers' },
  ],
};
