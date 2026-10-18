import { describe, expect, it } from 'vitest';
import { belowReason, targetOf } from './quality-target';
import { evaluation, profile } from './rules.fixtures';

describe('targetOf', () => {
  it('reads the two numbers a file is measured against', () => {
    expect(targetOf(profile({ upgradeUntilScore: 500 }))).toEqual({
      cutoff: 'webdl-1080p',
      upgradeUntilScore: 500,
    });
  });

  it('has nothing to say before the rules have loaded', () => {
    expect(targetOf(undefined)).toBeNull();
  });
});

describe('belowReason', () => {
  it('blames the quality when the file sits under the cutoff', () => {
    const reason = belowReason(profile(), evaluation('webdl-720p', 2));

    expect(reason).toEqual({ kind: 'quality', quality: 'webdl-720p', cutoff: 'webdl-1080p' });
  });

  it('blames the quality when the profile does not allow it at all', () => {
    const reason = belowReason(profile(), evaluation('cam', null));

    expect(reason).toMatchObject({ kind: 'quality', quality: 'cam' });
  });

  it('blames the score once the quality is good enough', () => {
    const demanding = profile({ upgradeUntilScore: 500 });

    expect(belowReason(demanding, evaluation('remux-2160p', 0, 100))).toEqual({
      kind: 'score',
      score: 100,
      need: 500,
    });
  });

  it('says nothing about a file that meets both', () => {
    expect(belowReason(profile(), evaluation('remux-2160p', 0, 100))).toBeNull();
  });
});
