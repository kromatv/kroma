import type { Rule, RuleAction, RulesUpdate, NetworkView } from '@kromatv/client/network';

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV6 = /^[0-9a-f:.]+$/;
const NAME_MAX = 253;
const NOTE_MAX = 200;
const WILDCARD = '*.';

type HostPattern = { ok: true; host: string | null } | { ok: false };

function isHostName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= NAME_MAX &&
    name.split('.').every((label) => LABEL.test(label))
  );
}

function isIpv6(host: string): boolean {
  return IPV6.test(host) && host.split(':').length > 2;
}

/** Reads what an admin typed in a rule's host field: an exact name, an IP, or
 * `*.suffix` for a whole domain. Case and a trailing dot are dropped; an empty
 * field means any host. */
export function parseHostPattern(input: string): HostPattern {
  const host = input.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return { ok: true, host: null };
  if (isIpv6(host)) return { ok: true, host };
  const name = host.startsWith(WILDCARD) ? host.slice(WILDCARD.length) : host;
  return isHostName(name) ? { ok: true, host } : { ok: false };
}

/** A rule as the editor holds it: free text where the wire has a nullable. */
export type RuleDraft = Omit<Rule, 'id' | 'host' | 'note' | 'port' | 'address'> & {
  host: string;
  note: string;
  port: string;
  address: string;
};

export function draftOf(rule: Rule): RuleDraft {
  return {
    ...rule,
    host: rule.host ?? '',
    note: rule.note ?? '',
    port: rule.port ? String(rule.port) : '',
    address: rule.address ?? '',
  };
}

export const EMPTY_DRAFT: RuleDraft = {
  caller: null,
  purpose: null,
  host: '',
  action: 'block',
  note: '',
  port: '',
  address: '',
};

const ADDRESS_RANGE = /^[0-9a-fA-F:.]+\/\d{1,3}$/;

// `null` for an empty field, `undefined` for one that is not a port.
function parsePort(input: string): number | null | undefined {
  const text = input.trim();
  if (!text) return null;
  const port = Number(text);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : undefined;
}

/** The network the presets send calls through: whichever tunnel the VPN page
 *  made the default, so a rule naming it follows that page's choice. */
export const DEFAULT_NETWORK = 'vpn';

/** A network a rule can name, and what its module calls it. `label` is `null`
 *  for one no longer on offer. */
export interface NetworkChoice {
  name: string;
  label: string | null;
}

/** The networks a rule can name: every one on offer, and the one it already names,
 *  which may be down or gone. */
export function actionNetworks(
  networks: readonly NetworkView[],
  current: string,
): readonly NetworkChoice[] {
  const offered = networks.map(({ name, label }) => ({ name, label }));
  const named =
    current !== 'direct' && current !== 'block' && !offered.some(({ name }) => name === current);
  return named ? [...offered, { name: current, label: null }] : offered;
}

/** The rule a draft stands for, refused while one of its fields is not valid. */
export function ruleFromDraft(
  draft: RuleDraft,
  id: string,
): { ok: true; rule: Rule } | { ok: false; field: 'host' | 'port' | 'address' } {
  const host = parseHostPattern(draft.host);
  if (!host.ok) return { ok: false, field: 'host' };
  const port = parsePort(draft.port);
  if (port === undefined) return { ok: false, field: 'port' };
  const address = draft.address.trim();
  if (address && !ADDRESS_RANGE.test(address)) return { ok: false, field: 'address' };
  const note = draft.note.trim().slice(0, NOTE_MAX);
  return {
    ok: true,
    rule: {
      id,
      caller: draft.caller,
      purpose: draft.purpose,
      host: host.host,
      port,
      address: address || null,
      action: draft.action,
      note: note || null,
    },
  };
}

/** The first `r-<n>` no rule in the list holds. */
export function freshRuleId(rules: readonly Rule[]): string {
  const taken = new Set(rules.map((rule) => rule.id));
  let n = 1;
  while (taken.has(`r-${n}`)) n += 1;
  return `r-${n}`;
}

/** Swaps the rule at `index` with its neighbour `offset` away; the same list
 * when that neighbour does not exist. */
export function moveRule(rules: Rule[], index: number, offset: -1 | 1): Rule[] {
  const target = index + offset;
  const moving = rules[index];
  const neighbour = rules[target];
  if (!moving || !neighbour) return rules;
  const next = [...rules];
  next[index] = neighbour;
  next[target] = moving;
  return next;
}

function sameRule(a: Rule, b: Rule): boolean {
  return (
    a.id === b.id &&
    a.caller === b.caller &&
    a.purpose === b.purpose &&
    a.host === b.host &&
    a.action === b.action &&
    a.note === b.note
  );
}

export function sameRules(a: RulesUpdate, b: RulesUpdate): boolean {
  return (
    a.defaultAction === b.defaultAction &&
    a.rules.length === b.rules.length &&
    a.rules.every((rule, index) => {
      const other = b.rules[index];
      return other !== undefined && sameRule(rule, other);
    })
  );
}

/** Puts a rule for `host` alone at the head of the list, where no broader rule
 * can answer first. A rule already written for that host alone moves there with
 * the new action rather than being written twice. */
export function withHostRule(update: RulesUpdate, host: string, action: RuleAction): RulesUpdate {
  const forHostAlone = (rule: Rule) =>
    rule.host === host && rule.caller === null && rule.purpose === null;
  const existing = update.rules.find(forHostAlone);
  const placed: Rule = existing
    ? { ...existing, action }
    : { id: freshRuleId(update.rules), caller: null, purpose: null, host, action, note: null };
  return {
    defaultAction: update.defaultAction,
    rules: [placed, ...update.rules.filter((rule) => !forHostAlone(rule))],
  };
}
