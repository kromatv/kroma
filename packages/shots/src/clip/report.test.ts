import { describe, expect, it } from 'vitest';
import {
  collapse,
  type Finding,
  findingLine,
  type Keyed,
  missText,
  reportLines,
  summaryLine,
} from './report';

const SWEPT = ['en', 'de', 'vi'];

function clip(language: string, text: string, extra: Partial<Keyed> = {}): Keyed {
  return {
    language,
    target: 'web',
    screen: '/admin/monitoring',
    text,
    clipped: { width: 8, height: 0 },
    key: null,
    ...extra,
  };
}

function finding(extra: Partial<Finding> = {}): Finding {
  return {
    languages: ['de'],
    target: 'web',
    screen: '/admin/monitoring',
    text: 'Gefolgt',
    key: 'de:monitoring.followed',
    clipped: { width: 8, height: 0 },
    times: 1,
    ...extra,
  };
}

describe('the findings of a sweep', () => {
  it('count a text one screen shows several times once, with how many times', () => {
    const [only, ...rest] = collapse([clip('de', 'curl exit 56'), clip('de', 'curl exit 56')]);

    expect(rest).toEqual([]);
    expect(only).toMatchObject({ languages: ['de'], times: 2 });
  });

  it('gather a text clipped the same way in several languages into one finding', () => {
    const findings = collapse([clip('en', 'Dune: Part Two'), clip('de', 'Dune: Part Two')]);

    expect(findings.map((found) => found.languages)).toEqual([['en', 'de']]);
  });

  it('keep each translation of a text apart', () => {
    const findings = collapse([clip('de', 'Gefolgt'), clip('vi', 'Đang theo dõi')]);

    expect(findings).toHaveLength(2);
  });
});

describe('a finding as a line', () => {
  it('says how much of the text is cut across, down, or both', () => {
    expect(missText({ width: 8, height: 0 })).toBe('misses 8px across');
    expect(missText({ width: 0, height: 20 })).toBe('misses 20px down');
    expect(missText({ width: 8, height: 20 })).toBe('misses 8px across and 20px down');
  });

  it('names the language, the target, the screen, the text and its key', () => {
    expect(findingLine(finding(), SWEPT)).toBe(
      'de       web   /admin/monitoring  "Gefolgt" (de:monitoring.followed)  misses 8px across',
    );
  });

  it('says all for a text clipped in every language swept, and how often it repeats', () => {
    const everywhere = finding({ languages: SWEPT, key: null, text: 'Dune', times: 3 });

    expect(findingLine(everywhere, SWEPT)).toBe(
      'all      web   /admin/monitoring  "Dune"  misses 8px across (x3)',
    );
  });

  it('keeps a long text to one short line', () => {
    const line = findingLine(
      finding({ text: `Joe Russo\n${'is a filmmaker '.repeat(10)}` }),
      SWEPT,
    );

    expect(line).toContain(`"Joe Russo is a filmmaker ${'is a filmmaker '.repeat(3)}`);
    expect(line).toMatch(/…" \(de:/);
  });
});

describe('the report', () => {
  it('lists the texts of the catalogs before the rest, then what it could not read', () => {
    const findings = [finding({ key: null, text: 'Dune' }), finding()];
    const unread = [
      { language: 'vi', target: 'tizen', screen: 'search', reason: 'it stayed in "de"' },
    ];

    expect(reportLines(findings, unread, SWEPT)).toEqual([
      '',
      'From the catalogs:',
      'de       web   /admin/monitoring  "Gefolgt" (de:monitoring.followed)  misses 8px across',
      '',
      'Not from a catalog:',
      'de       web   /admin/monitoring  "Dune"  misses 8px across',
      '',
      'Not read:',
      'vi       tizen search  not read: it stayed in "de"',
      '',
      '2 clipped texts, 1 from the catalogs: de 2.',
    ]);
  });

  it('ends on the languages it found nothing in', () => {
    expect(summaryLine([], SWEPT)).toBe('No clipped text in en, de, vi.');
  });

  it('counts a finding in each language it is clipped in', () => {
    const findings = [
      finding({ languages: ['en', 'vi'], key: null }),
      finding({ languages: ['vi'] }),
    ];

    expect(summaryLine(findings, SWEPT)).toBe('2 clipped texts, 1 from the catalogs: en 1, vi 2.');
  });
});
