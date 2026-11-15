import { describe, expect, it } from 'vitest';
import { subtitleEtaTime, subtitleStageKey } from './subtitle-stage';

describe('subtitleStageKey', () => {
  it('maps known stages', () => {
    expect(subtitleStageKey('model')).toBe('player.subStageModel');
    expect(subtitleStageKey('extract')).toBe('player.subStageExtract');
    expect(subtitleStageKey('transcribe')).toBe('player.subStageTranscribe');
    expect(subtitleStageKey('translate')).toBe('player.subStageTranslate');
    expect(subtitleStageKey('error')).toBe('player.subStageError');
  });

  it('falls back to queued for unknown stages', () => {
    expect(subtitleStageKey('queued')).toBe('player.subStageQueued');
    expect(subtitleStageKey('anything')).toBe('player.subStageQueued');
  });
});

describe('subtitleEtaTime', () => {
  it('renders minutes at or above 60 seconds', () => {
    expect(subtitleEtaTime(60)).toBe('1 min');
    expect(subtitleEtaTime(90)).toBe('2 min'); // rounds
    expect(subtitleEtaTime(150)).toBe('3 min');
  });

  it('renders seconds below a minute, with a floor of 1', () => {
    expect(subtitleEtaTime(20)).toBe('20 s');
    expect(subtitleEtaTime(0.4)).toBe('1 s');
    expect(subtitleEtaTime(0)).toBe('1 s');
  });
});
