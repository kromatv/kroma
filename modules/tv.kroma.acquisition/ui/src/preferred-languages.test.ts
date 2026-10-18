import { describe, expect, it } from 'vitest';
import { bestPositiveScore, dubFormats, dubScores, withDubScores } from './preferred-languages';
import { profile } from './rules.fixtures';
import type { CustomFormat } from './rules-schemas';

function format(id: string, name: string): CustomFormat {
  return { id, name, conditions: [] };
}

const FORMATS: CustomFormat[] = [
  format('hevc', 'HEVC'),
  format('vff', 'VFF'),
  format('vfq', 'VFQ'),
  format('multi', 'MULTi'),
  format('vo', 'VO'),
];

describe('dubFormats', () => {
  it('finds a rung under the names a French rule book gives it', () => {
    const found = dubFormats([format('tf', 'TRUEFRENCH'), format('q', 'Doublage Québec')]);

    expect([...found.keys()]).toEqual(['VFF', 'VFQ']);
  });

  it('leaves out a rung nothing names', () => {
    expect([...dubFormats([format('hevc', 'HEVC')]).keys()]).toEqual([]);
  });
});

describe('dubScores', () => {
  it('orders the dubs VFF first and VFQ last of the ones that score', () => {
    const scores = dubScores(profile(), FORMATS);

    expect(scores.map((entry) => entry.dub)).toEqual(['VFF', 'MULTi', 'VFQ', 'VO']);
  });

  it('puts every scoring rung above the best codec score', () => {
    const scores = dubScores(profile({ formatScores: { hevc: 400 } }), FORMATS);

    expect(scores.filter((entry) => entry.score > 0).every((entry) => entry.score > 400)).toBe(
      true,
    );
  });

  it('leaves the original audio at zero, because it is the baseline', () => {
    const scores = dubScores(profile(), FORMATS);

    expect(scores.find((entry) => entry.dub === 'VO')?.score).toBe(0);
  });
});

describe('withDubScores', () => {
  it('writes the proposal and drops the rung worth nothing', () => {
    const written = withDubScores(profile(), dubScores(profile(), FORMATS));

    expect(written.formatScores.vff).toBeGreaterThan(written.formatScores.vfq as number);
    expect(written.formatScores.vo).toBeUndefined();
    expect(written.formatScores.hevc).toBe(400);
  });
});

describe('bestPositiveScore', () => {
  it('reports the heaviest single format a release can earn', () => {
    expect(
      bestPositiveScore(profile({ formatScores: { hevc: 400, vff: 900, xvid: -10000 } })),
    ).toBe(900);
  });

  it('reports nothing when no format is worth anything', () => {
    expect(bestPositiveScore(profile({ formatScores: {} }))).toBe(0);
  });
});
