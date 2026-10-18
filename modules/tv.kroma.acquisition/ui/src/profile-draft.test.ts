import { describe, expect, it } from 'vitest';
import {
  allowedQualities,
  copyOfProfile,
  freeId,
  moveTier,
  setFormatScore,
  setTierAllowed,
  termsOf,
  termsText,
} from './profile-draft';
import { profile } from './rules.fixtures';

describe('allowedQualities', () => {
  it('lists the qualities of the allowed rungs, best first', () => {
    const only720 = setTierAllowed(setTierAllowed(profile(), 0, false), 1, false);

    expect(allowedQualities(only720)).toEqual(['webdl-720p']);
  });
});

describe('moveTier', () => {
  it('swaps a rung with the one above it', () => {
    const moved = moveTier(profile(), 1, -1);

    expect(moved.tiers.map((tier) => tier.qualities)).toEqual([
      ['webdl-1080p', 'bluray-1080p'],
      ['remux-2160p'],
      ['webdl-720p'],
    ]);
  });

  it('leaves the ladder alone at the end it is moving towards', () => {
    const top = profile();

    expect(moveTier(top, 0, -1)).toBe(top);
    expect(moveTier(top, 2, 1)).toBe(top);
    expect(moveTier(top, 9, -1)).toBe(top);
  });
});

describe('setTierAllowed', () => {
  it('switches one rung off and leaves the others', () => {
    const off = setTierAllowed(profile(), 2, false);

    expect(off.tiers.map((tier) => tier.allowed)).toEqual([true, true, false]);
  });

  it('moves the cutoff to the best remaining quality when its rung goes off', () => {
    const off = setTierAllowed(profile(), 1, false);

    expect(off.cutoff).toBe('remux-2160p');
  });

  it('keeps the cutoff when nothing is allowed, so the server states the reason', () => {
    const one = profile({ tiers: [{ name: null, qualities: ['webdl-1080p'], allowed: true }] });

    const none = setTierAllowed(one, 0, false);

    expect(none.cutoff).toBe('webdl-1080p');
  });
});

describe('setFormatScore', () => {
  it('records a score and drops the format at zero', () => {
    const scored = setFormatScore(profile(), 'hdr10', -200);

    expect(scored.formatScores).toEqual({ hevc: 400, hdr10: -200 });
    expect(setFormatScore(scored, 'hevc', 0).formatScores).toEqual({ hdr10: -200 });
  });
});

describe('copyOfProfile', () => {
  it('carries the ladder and the scores under a free id', () => {
    const copy = copyOfProfile(profile(), 'Quebec 4K', ['default']);

    expect(copy.id).toBe('quebec-4k');
    expect(copy.name).toBe('Quebec 4K');
    expect(copy.tiers).toEqual(profile().tiers);
    expect(copy.formatScores).toEqual({ hevc: 400 });
  });

  it('copies the arrays rather than sharing them with the source', () => {
    const source = profile();

    const copy = copyOfProfile(source, 'Autre', []);
    copy.tiers[0]?.qualities.push('cam');

    expect(source.tiers[0]?.qualities).toEqual(['remux-2160p']);
  });
});

describe('freeId', () => {
  it('slugs a name, accents and punctuation included', () => {
    expect(freeId('Séries françaises', [])).toBe('series-francaises');
  });

  it('numbers a slug another profile already holds', () => {
    expect(freeId('Films', ['films'])).toBe('films-2');
    expect(freeId('Films', ['films', 'films-2'])).toBe('films-3');
  });

  it('falls back to a usable id for a name that slugs to nothing', () => {
    expect(freeId('***', [])).toBe('profile');
  });
});

describe('termsOf', () => {
  it('reads one term per line and drops the blanks', () => {
    expect(termsOf(' MULTi \n\n VFF, VFQ ')).toEqual(['MULTi', 'VFF', 'VFQ']);
  });

  it('round-trips through the text the editor shows', () => {
    expect(termsOf(termsText(['MULTi', 'VFF']))).toEqual(['MULTi', 'VFF']);
  });
});
