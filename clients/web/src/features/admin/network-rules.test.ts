import type { RulesUpdate } from '@kromatv/client/network';
import { describe, expect, it } from 'vitest';
import {
  freshRuleId,
  moveRule,
  parseHostPattern,
  ruleFromDraft,
  sameRules,
  withHostRule,
} from '#web/features/admin/network-rules';
import { RULES_VIEW, ruleOf as rule } from '#web/features/admin/network.fixture';

const RULES: RulesUpdate = { defaultAction: RULES_VIEW.defaultAction, rules: RULES_VIEW.rules };

describe('a host pattern', () => {
  it.each([
    ['api.themoviedb.org', 'api.themoviedb.org'],
    ['  API.TheMovieDB.org.  ', 'api.themoviedb.org'],
    ['*.trackers.example', '*.trackers.example'],
    ['*.lan', '*.lan'],
    ['192.168.1.20', '192.168.1.20'],
    ['2001:db8::1', '2001:db8::1'],
  ])('accepts %j as %j', (input, host) => {
    expect(parseHostPattern(input)).toEqual({ ok: true, host });
  });

  it('reads an empty field as any host', () => {
    expect(parseHostPattern('   ')).toEqual({ ok: true, host: null });
  });

  it.each([
    'https://example.org',
    'example.org:443',
    'example.org/path',
    '*',
    '*.',
    'a.*.example',
    '*.*.example',
    '-bad.example',
    'bad-.example',
    'two words.example',
    `${'a'.repeat(64)}.example`,
  ])('refuses %j', (input) => {
    expect(parseHostPattern(input)).toEqual({ ok: false });
  });

  it('refuses a name longer than DNS allows', () => {
    const long = Array.from({ length: 5 }, () => 'a'.repeat(60)).join('.');

    expect(parseHostPattern(long)).toEqual({ ok: false });
  });
});

describe('a rule written in the editor', () => {
  it('becomes a rule with its note trimmed and an empty note dropped', () => {
    const draft = {
      caller: 'core',
      purpose: 'metadata',
      host: '',
      action: 'direct',
      note: '  ',
    } as const;

    expect(ruleFromDraft(draft, 'r-9')).toEqual({
      ok: true,
      rule: rule({ id: 'r-9', caller: 'core', purpose: 'metadata' }),
    });
  });

  it('is refused while its host is not a name or a wildcard', () => {
    const draft = {
      caller: null,
      purpose: null,
      host: 'http://x',
      action: 'block',
      note: '',
    } as const;

    expect(ruleFromDraft(draft, 'r-9')).toEqual({ ok: false });
  });
});

describe('a new rule id', () => {
  it('takes the first number no rule holds', () => {
    expect(freshRuleId([rule({ id: 'r-1' }), rule({ id: 'r-3' })])).toBe('r-2');
  });

  it('starts at one on an empty list', () => {
    expect(freshRuleId([])).toBe('r-1');
  });
});

describe('moving a rule', () => {
  it('swaps it with the one above', () => {
    expect(moveRule(RULES.rules, 1, -1).map((one) => one.id)).toEqual(['r-2', 'r-1']);
  });

  it('leaves the list alone past either end', () => {
    expect(moveRule(RULES.rules, 0, -1)).toBe(RULES.rules);
    expect(moveRule(RULES.rules, 1, 1)).toBe(RULES.rules);
  });
});

describe('comparing two lists', () => {
  it('holds a copy equal to the original', () => {
    expect(sameRules(RULES, structuredClone(RULES))).toBe(true);
  });

  it('tells a changed default action apart', () => {
    expect(sameRules(RULES, { ...RULES, defaultAction: 'block' })).toBe(false);
  });

  it('tells a reordered list apart', () => {
    expect(sameRules(RULES, { ...RULES, rules: moveRule(RULES.rules, 1, -1) })).toBe(false);
  });

  it('tells an edited note apart', () => {
    const edited = RULES.rules.map((one) => ({ ...one, note: 'changé' }));

    expect(sameRules(RULES, { ...RULES, rules: edited })).toBe(false);
  });
});

describe('a rule for one host', () => {
  it('goes first, so no broader rule answers before it', () => {
    const next = withHostRule(RULES, 'tracker.example', 'block');

    expect(next.rules[0]).toEqual(rule({ id: 'r-3', host: 'tracker.example', action: 'block' }));
    expect(next.rules.slice(1)).toEqual(RULES.rules);
  });

  it('moves a rule already written for that host alone to the top with its new action', () => {
    const next = withHostRule(RULES, '*.doubleclick.net', 'vpn');

    expect(next.rules.map((one) => [one.id, one.action])).toEqual([
      ['r-2', 'vpn'],
      ['r-1', 'vpn'],
    ]);
  });

  it('hands back only what a save sends, whatever else the list carried', () => {
    const view = { ...RULES, purposes: [{ caller: 'core', purpose: 'metadata' }] };

    expect(Object.keys(withHostRule(view, 'x.example', 'block'))).toEqual([
      'defaultAction',
      'rules',
    ]);
  });

  it('keeps the default action', () => {
    expect(
      withHostRule({ ...RULES, defaultAction: 'block' }, 'x.example', 'vpn').defaultAction,
    ).toBe('block');
  });
});
