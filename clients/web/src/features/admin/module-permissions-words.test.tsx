// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { englishT } from '#web/features/admin/module-permissions.fixture';
import { listOf, opening, purposeWord } from '#web/features/admin/module-permissions-words';

const t = englishT();

describe('listOf', () => {
  it('joins one, two and three items as a sentence does', () => {
    expect([['a'], ['a', 'b'], ['a', 'b', 'c']].map((items) => listOf(items, t))).toEqual([
      'a',
      'a and b',
      'a, b and c',
    ]);
  });

  it('counts what it does not show, and what was never in the list', () => {
    expect(listOf(['a', 'b', 'c', 'd'], t, 2)).toBe('a, b and 2 others');
    expect(listOf(['a'], t, 2, 1)).toBe('a and 1 other');
  });

  it('says nothing for nothing', () => {
    expect(listOf([], t)).toBe('');
  });
});

describe('purposeWord', () => {
  it('quotes a purpose the core has no words for as the module wrote it', () => {
    expect(purposeWord('telemetry', t)).toBe('its telemetry use');
  });
});

describe('opening', () => {
  it('raises the first letter only', () => {
    expect(opening('any website, port 443')).toBe('Any website, port 443');
  });
});
