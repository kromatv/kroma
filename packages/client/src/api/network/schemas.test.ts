import { describe, expect, it } from 'vitest';
import { FlowsView, ListenersView, NetworkSummary, RulesView } from './schemas';

const FLOW = {
  id: 'f-1029',
  at: 1_761_820_800_000,
  caller: 'tv.kroma.torrents',
  purpose: 'trackers',
  method: 'GET',
  host: 'tracker.opentrackr.org',
  port: 443,
  route: 'vpn',
  status: 200,
  bytesIn: 18_432,
  bytesOut: 912,
  durationMs: 238,
  error: null,
  rule: 'r-downloads',
};

const SUMMARY = {
  since: 1_761_216_000_000,
  totals: { flows: 4210, blocked: 37, bytesIn: 5_368_709_120, bytesOut: 104_857_600 },
  rows: [
    {
      caller: 'core',
      purpose: 'metadata',
      host: 'api.themoviedb.org',
      route: 'direct',
      verdict: 'allowed',
      count: 1820,
      bytesIn: 73_400_320,
      bytesOut: 1_048_576,
      lastAt: 1_761_820_700_000,
    },
  ],
};

const RULES = {
  defaultAction: 'allow',
  rules: [
    {
      id: 'r-downloads',
      caller: 'tv.kroma.torrents',
      purpose: null,
      host: null,
      action: 'vpn',
      note: 'Les pairs ne voient que le VPN',
    },
    {
      id: 'r-ads',
      caller: null,
      purpose: null,
      host: '*.doubleclick.net',
      action: 'block',
      note: null,
    },
  ],
  purposes: [
    { caller: 'core', purpose: 'metadata' },
    { caller: 'tv.kroma.torrents', purpose: 'trackers' },
  ],
};

const LISTENERS = {
  listeners: [
    {
      owner: 'core',
      protocol: 'tcp',
      address: '0.0.0.0',
      port: 4040,
      purpose: 'http',
      exposure: 'network',
    },
    {
      owner: 'tv.kroma.torrents',
      protocol: 'udp',
      address: '127.0.0.1',
      port: 6881,
      purpose: 'dht',
      exposure: 'loopback',
    },
  ],
};

describe('the connection journal', () => {
  it('reads a connection the VPN carried', () => {
    expect(FlowsView.parse({ flows: [FLOW] })).toEqual({ flows: [FLOW] });
  });

  it('reads a refused connection that never got a status', () => {
    const refused = { ...FLOW, route: 'blocked', status: null, bytesIn: 0, error: 'refused' };

    expect(FlowsView.parse({ flows: [refused] }).flows[0]).toMatchObject({ status: null });
  });

  it('drops fields this build does not know rather than failing', () => {
    const parsed = FlowsView.parse({ flows: [{ ...FLOW, tlsVersion: '1.3' }] });

    expect(parsed.flows[0]).not.toHaveProperty('tlsVersion');
  });

  it('refuses a route the page cannot draw', () => {
    expect(() => FlowsView.parse({ flows: [{ ...FLOW, route: 'tor' }] })).toThrow();
  });

  it('refuses a connection with no destination port', () => {
    const { port: _port, ...portless } = FLOW;

    expect(() => FlowsView.parse({ flows: [portless] })).toThrow();
  });
});

describe('the destinations summary', () => {
  it('reads the totals and the groups', () => {
    expect(NetworkSummary.parse(SUMMARY)).toEqual(SUMMARY);
  });

  it('refuses a verdict that is neither allowed nor blocked', () => {
    const row = { ...SUMMARY.rows[0], verdict: 'maybe' };

    expect(() => NetworkSummary.parse({ ...SUMMARY, rows: [row] })).toThrow();
  });
});

describe('the firewall rules', () => {
  it('reads the default action, the ordered rules and the declared purposes', () => {
    expect(RulesView.parse(RULES)).toEqual(RULES);
  });

  it('keeps the rules in the order the server sent', () => {
    expect(RulesView.parse(RULES).rules.map((rule) => rule.id)).toEqual(['r-downloads', 'r-ads']);
  });

  it('refuses an action other than direct, vpn or block', () => {
    const rules = [{ ...RULES.rules[0], action: 'allow' }];

    expect(() => RulesView.parse({ ...RULES, rules })).toThrow();
  });

  it('refuses a default action other than allow or block', () => {
    expect(() => RulesView.parse({ ...RULES, defaultAction: 'vpn' })).toThrow();
  });
});

describe('the listening sockets', () => {
  it('reads a socket open to the network and one kept to this machine', () => {
    expect(ListenersView.parse(LISTENERS)).toEqual(LISTENERS);
  });

  it('refuses a protocol other than tcp or udp', () => {
    const listener = { ...LISTENERS.listeners[0], protocol: 'sctp' };

    expect(() => ListenersView.parse({ listeners: [listener] })).toThrow();
  });
});
