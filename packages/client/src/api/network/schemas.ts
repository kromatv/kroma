import { z } from 'zod';

/** Where one outbound connection went: straight out, through the VPN tunnel, or
 * nowhere because a rule refused it. */
export const FlowRoute = z.enum(['direct', 'vpn', 'blocked']);
export type FlowRoute = z.infer<typeof FlowRoute>;

/** The firewall's answer to a connection, independent of the road it took. */
export const FlowVerdict = z.enum(['allowed', 'blocked']);
export type FlowVerdict = z.infer<typeof FlowVerdict>;

/** One outbound connection the server or a module opened. `caller` is `core`
 * or a module id, `at` is epoch milliseconds, `rule` is the id of the rule that
 * matched (null when the default action decided). */
export const Flow = z.object({
  id: z.string(),
  at: z.number(),
  caller: z.string(),
  purpose: z.string(),
  method: z.string(),
  host: z.string(),
  port: z.number().int(),
  route: FlowRoute,
  status: z.number().int().nullable(),
  bytesIn: z.number().nonnegative(),
  bytesOut: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
  error: z.string().nullable(),
  rule: z.string().nullable(),
});
export type Flow = z.infer<typeof Flow>;

/** `GET /api/admin/network/flows`, newest first. */
export const FlowsView = z.object({ flows: z.array(Flow) });
export type FlowsView = z.infer<typeof FlowsView>;

/** The journal's server-side filters; an absent one matches everything. */
export type FlowQuery = {
  limit?: number;
  caller?: string;
  purpose?: string;
  verdict?: FlowVerdict;
};

/** One (caller, purpose, host, route) group of connections over the window. */
export const SummaryRow = z.object({
  caller: z.string(),
  purpose: z.string(),
  host: z.string(),
  route: FlowRoute,
  verdict: FlowVerdict,
  count: z.number().int().nonnegative(),
  bytesIn: z.number().nonnegative(),
  bytesOut: z.number().nonnegative(),
  lastAt: z.number(),
});
export type SummaryRow = z.infer<typeof SummaryRow>;

export const SummaryTotals = z.object({
  flows: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  bytesIn: z.number().nonnegative(),
  bytesOut: z.number().nonnegative(),
});
export type SummaryTotals = z.infer<typeof SummaryTotals>;

/** `GET /api/admin/network/summary`: every connection since `since` (epoch
 * milliseconds), totalled and grouped. */
export const NetworkSummary = z.object({
  since: z.number(),
  totals: SummaryTotals,
  rows: z.array(SummaryRow),
});
export type NetworkSummary = z.infer<typeof NetworkSummary>;

/** What a matching rule does with a connection. */
export const RuleAction = z.enum(['direct', 'vpn', 'block']);
export type RuleAction = z.infer<typeof RuleAction>;

/** What happens to a connection no rule matches. */
export const DefaultAction = z.enum(['allow', 'block']);
export type DefaultAction = z.infer<typeof DefaultAction>;

/** One firewall rule. A null matcher matches anything; `host` is an exact name
 * or `*.suffix`. Rules are read in order and the first match wins. */
export const Rule = z.object({
  id: z.string(),
  caller: z.string().nullable(),
  purpose: z.string().nullable(),
  host: z.string().nullable(),
  action: RuleAction,
  note: z.string().nullable(),
});
export type Rule = z.infer<typeof Rule>;

/** A purpose some caller declared, offered when writing a rule. */
export const DeclaredPurpose = z.object({ caller: z.string(), purpose: z.string() });
export type DeclaredPurpose = z.infer<typeof DeclaredPurpose>;

/** `GET /api/admin/network/rules`. */
export const RulesView = z.object({
  defaultAction: DefaultAction,
  rules: z.array(Rule),
  purposes: z.array(DeclaredPurpose),
});
export type RulesView = z.infer<typeof RulesView>;

/** `PUT /api/admin/network/rules` body: the whole list, replacing the stored one. */
export const RulesUpdate = RulesView.pick({ defaultAction: true, rules: true });
export type RulesUpdate = z.infer<typeof RulesUpdate>;

/** Whether a socket answers the whole network or only this machine. */
export const ListenerExposure = z.enum(['network', 'loopback']);
export type ListenerExposure = z.infer<typeof ListenerExposure>;

/** One socket the server or a module is listening on. */
export const Listener = z.object({
  owner: z.string(),
  protocol: z.enum(['tcp', 'udp']),
  address: z.string(),
  port: z.number().int(),
  purpose: z.string(),
  exposure: ListenerExposure,
});
export type Listener = z.infer<typeof Listener>;

/** `GET /api/admin/network/listeners`. */
export const ListenersView = z.object({ listeners: z.array(Listener) });
export type ListenersView = z.infer<typeof ListenersView>;
