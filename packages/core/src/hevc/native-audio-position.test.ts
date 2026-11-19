import { describe, expect, it } from 'vitest';
import { track } from './directplay.fixture';
import { nativeAudioPosition } from './native-audio-position';

const EN = track({ index: 0, language: 'eng', title: 'English' });
const FR = track({ index: 1, language: 'fra', title: 'Français', default: true });
const EN_COMMENTARY = track({ index: 2, language: 'eng', title: 'Commentary' });

describe('nativeAudioPosition', () => {
  it('finds the wanted language where the player lists the tracks in another order', () => {
    const native = [{ language: 'fr' }, { language: 'en' }];

    expect(nativeAudioPosition([EN, FR], 0, native)).toBe(1);
    expect(nativeAudioPosition([EN, FR], 1, native)).toBe(0);
  });

  it('tells two tracks of one language apart by their order', () => {
    const native = [{ language: 'fr' }, { language: 'en' }, { language: 'en' }];

    expect(nativeAudioPosition([EN, FR, EN_COMMENTARY], 0, native)).toBe(1);
    expect(nativeAudioPosition([EN, FR, EN_COMMENTARY], 2, native)).toBe(2);
  });

  it('takes the position when the player names no language', () => {
    const native = [{ language: 'und' }, { language: null }];

    expect(nativeAudioPosition([EN, FR], 1, native)).toBe(1);
  });

  it('takes an unlabelled track at the wanted position', () => {
    const native = [{ language: 'en' }, { language: 'und' }];

    expect(nativeAudioPosition([EN, FR], 1, native)).toBe(1);
  });

  it('takes the position for a file track whose own language is unknown', () => {
    const unnamed = track({ index: 1, language: 'und' });

    expect(nativeAudioPosition([EN, unnamed], 1, [{ language: 'en' }, { language: 'fr' }])).toBe(1);
  });

  it('answers null when the player does not list the wanted track', () => {
    expect(nativeAudioPosition([EN, FR], 1, [{ language: 'en' }])).toBeNull();
  });

  it('never picks a track whose language contradicts the wanted one', () => {
    const commentary = track({ index: 1, language: 'eng', title: 'Commentary' });
    const french = track({ index: 2, language: 'fra' });
    const native = [{ language: 'en' }, { language: 'fr' }];

    expect(nativeAudioPosition([EN, commentary, french], 1, native)).toBeNull();
  });

  it('reads a language name as no language at all', () => {
    const native = [{ language: 'French' }, { language: 'English' }];

    expect(nativeAudioPosition([EN, FR], 0, native)).toBe(0);
  });
});
