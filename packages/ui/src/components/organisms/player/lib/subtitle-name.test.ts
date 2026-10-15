import { describe, expect, it } from 'vitest';
import type { PlayerSub } from '#ui/components/organisms/player/types';
import { subtitleName } from './subtitle-name';

const t = ((key: string) => key) as never;

const sub = (over: Partial<PlayerSub>): PlayerSub => ({
  index: 0,
  language: 'eng',
  codec: 'subrip',
  selectable: true,
  ...over,
});

describe('a subtitle row name', () => {
  it('says subtitles are off when no track is picked', () => {
    expect(subtitleName(t, null)).toBe('player.subtitlesOff');
  });

  it('names a track by its language', () => {
    expect(subtitleName(t, sub({ language: 'fra' }))).toBe('lang.fr');
  });

  it('tells two tracks of one language apart by the title the file gave them', () => {
    const plain = sub({ language: 'eng' });
    const forTheDeaf = sub({ language: 'eng', title: 'SDH' });

    expect(subtitleName(t, plain)).toBe('lang.en');
    expect(subtitleName(t, forTheDeaf)).toBe('lang.en · SDH');
  });

  it('keeps a generated track under the name it was generated with', () => {
    const made = sub({ ai: true, label: 'Français (IA)', title: 'ignored' });

    expect(subtitleName(t, made)).toBe('Français (IA)');
  });

  it('falls back to a name for a track that declares no language', () => {
    expect(subtitleName(t, sub({ language: null }))).toBe('player.langUnknown');
  });

  it('draws no separator for a title that is only spaces', () => {
    expect(subtitleName(t, sub({ title: '   ' }))).toBe('lang.en');
  });
});
