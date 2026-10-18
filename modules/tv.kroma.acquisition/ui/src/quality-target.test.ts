import { describe, expect, it } from 'vitest';
import type { Evaluation } from './judgement-schemas';
import { goalOf, shortfallsOf } from './quality-target';
import { evaluation, profile } from './rules.fixtures';

const FORMATS = [
  { id: 'hevc', name: 'HEVC' },
  { id: 'hdr10', name: 'HDR10' },
  { id: 'vff', name: 'VFF' },
  { id: 'vo-vff', name: 'VO + VFF' },
];

const TIERS_1080P = [
  { name: null, qualities: ['remux-1080p' as const], allowed: true },
  {
    name: null,
    qualities: ['bluray-1080p' as const, 'webdl-1080p' as const, 'unknown-1080p' as const],
    allowed: true,
  },
  { name: null, qualities: ['webrip-1080p' as const], allowed: true },
  { name: null, qualities: ['webdl-720p' as const, 'unknown-720p' as const], allowed: true },
  { name: null, qualities: ['webdl-2160p' as const], allowed: false },
];

const VFF = profile({
  tiers: TIERS_1080P,
  cutoff: 'bluray-1080p',
  formatScores: { hevc: 400, hdr10: 100, vff: 500 },
  upgradeUntilScore: 500,
});

function holding(quality: Evaluation['quality'], formats: string[], score: number): Evaluation {
  const matched = formats.map((id) => ({ id, name: id.toUpperCase(), score: 0 }));
  return { ...evaluation(quality, 1, score), formats: matched };
}

describe('goalOf', () => {
  it('names the cutoff rung by the resolution its qualities share', () => {
    expect(goalOf(VFF, FORMATS)).toMatchObject({
      rung: { kind: 'resolution', resolution: '1080p' },
    });
  });

  it('names a rung of one quality by that quality', () => {
    const remux = profile({ tiers: TIERS_1080P, cutoff: 'remux-1080p' });

    expect(goalOf(remux, FORMATS)).toMatchObject({
      rung: { kind: 'quality', quality: 'remux-1080p' },
    });
  });

  it('prefers the name a person gave the rung', () => {
    const named = profile({
      tiers: [{ name: 'HD', qualities: ['webdl-1080p', 'webdl-720p'], allowed: true }],
      cutoff: 'webdl-720p',
    });

    expect(goalOf(named, FORMATS)).toMatchObject({ rung: { kind: 'named', name: 'HD' } });
  });

  it('lists the qualities of a rung that spans resolutions', () => {
    const mixed = profile({
      tiers: [{ name: null, qualities: ['webdl-1080p', 'webdl-720p'], allowed: true }],
      cutoff: 'webdl-720p',
    });

    expect(goalOf(mixed, FORMATS)).toMatchObject({
      rung: { kind: 'qualities', qualities: ['webdl-1080p', 'webdl-720p'] },
    });
  });

  it('names the one format whose score reaches the upgrade-until score alone', () => {
    expect(goalOf(VFF, FORMATS)).toMatchObject({
      formats: { kind: 'one', format: { id: 'vff', name: 'VFF' } },
    });
  });

  it('offers either format when two reach the score alone', () => {
    const two = profile({ ...VFF, formatScores: { vff: 500, 'vo-vff': 600 } });

    expect(goalOf(two, FORMATS)).toMatchObject({
      formats: { kind: 'either', formats: [{ id: 'vff' }, { id: 'vo-vff' }] },
    });
  });

  it('asks for both formats of the only pair that reaches the score', () => {
    const pair = profile({ ...VFF, formatScores: { hevc: 400, hdr10: 100 } });

    expect(goalOf(pair, FORMATS)).toMatchObject({
      formats: { kind: 'both', formats: [{ id: 'hevc' }, { id: 'hdr10' }] },
    });
  });

  it('falls back to the score when no format or single pair explains it', () => {
    const many = profile({ ...VFF, formatScores: { hevc: 300, hdr10: 300, vff: 300 } });

    expect(goalOf(many, FORMATS)).toMatchObject({ formats: { kind: 'score', score: 500 } });
  });

  it('asks for no format when the profile sets no upgrade-until score', () => {
    expect(goalOf(profile(), FORMATS)).toMatchObject({ formats: { kind: 'none' } });
  });

  it('has no target for a profile that never upgrades', () => {
    expect(goalOf(profile({ upgradesAllowed: false }), FORMATS)).toEqual({ kind: 'keep' });
  });

  it('has nothing to say before the rules have loaded', () => {
    expect(goalOf(undefined, FORMATS)).toBeNull();
  });
});

describe('shortfallsOf', () => {
  const goal = goalOf(VFF, FORMATS);

  it('finds nothing missing in a file on the cutoff rung with the format', () => {
    expect(shortfallsOf(goal, holding('webdl-1080p', ['vff'], 500))).toEqual([]);
  });

  it('blames the resolution of a file under the rung', () => {
    expect(shortfallsOf(goal, holding('unknown-720p', ['vff'], 500))).toEqual([
      { kind: 'lower', quality: 'unknown-720p', byResolution: true },
    ]);
  });

  it('blames the ranking of a file at the rung resolution but under it', () => {
    expect(shortfallsOf(goal, holding('webrip-1080p', ['vff'], 500))).toEqual([
      { kind: 'ranked', quality: 'webrip-1080p' },
    ]);
  });

  it('blames the quality itself when the profile refuses it', () => {
    expect(
      shortfallsOf(goal, { ...holding('webdl-2160p', ['vff'], 500), qualityRank: null }),
    ).toEqual([{ kind: 'refused', quality: 'webdl-2160p' }]);
  });

  it('names the format a file lacks as well as its resolution', () => {
    expect(shortfallsOf(goal, holding('unknown-720p', ['hevc'], 400))).toEqual([
      { kind: 'lower', quality: 'unknown-720p', byResolution: true },
      { kind: 'missing', formats: [{ id: 'vff', name: 'VFF' }] },
    ]);
  });

  it('gives the score when the goal format is held and the score still falls short', () => {
    expect(shortfallsOf(goal, holding('webdl-1080p', ['vff'], 300))).toEqual([
      { kind: 'score', score: 300, need: 500 },
    ]);
  });

  it('says nothing for a profile that never upgrades', () => {
    const keep = goalOf(profile({ upgradesAllowed: false }), FORMATS);

    expect(shortfallsOf(keep, holding('unknown-720p', [], 0))).toEqual([]);
  });
});

function pairProfile() {
  return profile({
    tiers: TIERS_1080P,
    cutoff: 'bluray-1080p',
    formatScores: { hevc: 400, hdr10: 100 },
    upgradeUntilScore: 500,
  });
}

describe('shortfallsOf for a goal reached by a pair of formats', () => {
  const either = goalOf(
    profile({
      tiers: TIERS_1080P,
      cutoff: 'bluray-1080p',
      formatScores: { hevc: 500, vff: 500 },
      upgradeUntilScore: 500,
    }),
    FORMATS,
  );
  const both = goalOf(pairProfile(), FORMATS);

  it('names both formats of an either goal when a file holds neither', () => {
    expect(shortfallsOf(either, holding('webdl-1080p', [], 0))).toEqual([
      {
        kind: 'missing',
        formats: [
          { id: 'hevc', name: 'HEVC' },
          { id: 'vff', name: 'VFF' },
        ],
      },
    ]);
  });

  it('gives the score of an either goal when one of its formats is held', () => {
    expect(shortfallsOf(either, holding('webdl-1080p', ['hevc'], 100))).toEqual([
      { kind: 'score', score: 100, need: 500 },
    ]);
  });

  it('names the format a both goal still lacks', () => {
    expect(shortfallsOf(both, holding('webdl-1080p', ['hevc'], 400))).toEqual([
      { kind: 'missing', formats: [{ id: 'hdr10', name: 'HDR10' }] },
    ]);
  });
});
