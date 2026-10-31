import type { Rule, RuleAction, RulesUpdate } from '@kromatv/client/network';

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
export type RuleDraft = Omit<Rule, 'id' | 'host' | 'note'> & { host: string; note: string };

export function draftOf(rule: Rule): RuleDraft {
  return { ...rule, host: rule.host ?? '', note: rule.note ?? '' };
}

export const EMPTY_DRAFT: RuleDraft = {
  caller: null,
  purpose: null,
  host: '',
  action: 'block',
  note: '',
};

/** The rule a draft stands for, refused while its host is not a valid pattern. */
export function ruleFromDraft(
  draft: RuleDraft,
  id: string,
): { ok: true; rule: Rule } | { ok: false } {
  const host = parseHostPattern(draft.host);
  if (!host.ok) return host;
  const note = draft.note.trim().slice(0, NOTE_MAX);
  return {
    ok: true,
    rule: {
      id,
      caller: draft.caller,
      purpose: draft.purpose,
      host: host.host,
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
