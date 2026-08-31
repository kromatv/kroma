import type { AudioTrack, MediaItem } from '@kroma/core';
import type { AudioTrack as LocalAudioTrack } from 'expo-video';
import { describe, expect, it } from 'vitest';
import type { useT } from '#mobile/lib/i18n';
import type { Engine } from './engine';
import { audioOptions, qualityBadge, subNote, subtitleLabel } from './trackOptions';
import type { Subtitles } from './useSubtitles';

const NAMES: Record<string, string> = {
  'lang.fr': 'Français',
  'lang.fr-FR': 'Français (France)',
  'lang.en': 'Anglais',
  'player.subtitlesOff': 'Désactivés',
  'player.subPreparing': 'Préparation',
  'error.subtitleUnavailable': 'Indisponible',
};
const t = ((key: string) => NAMES[key] ?? key) as ReturnType<typeof useT>;

const track = (fields: Partial<AudioTrack>): AudioTrack => ({
  index: 0,
  codec: 'eac3',
  channels: 6,
  language: 'fra',
  title: null,
  default: false,
  ...fields,
});

const item = (tracks: AudioTrack[]): MediaItem =>
  ({ audioTracks: tracks, audio: tracks[0] ?? null }) as MediaItem;

const engine = (fields: Partial<Engine>): Engine =>
  ({ offline: false, localAudio: [], ...fields }) as Engine;

const subs = (fields: Partial<Subtitles>): Subtitles =>
  ({ tracks: [], active: null, loading: false, failed: new Set<number>(), ...fields }) as Subtitles;

describe('the audio picker while streaming from the server', () => {
  it('keeps the stream index the server knows the track by', () => {
    const options = audioOptions(engine({}), item([track({ index: 3 })]), t);

    expect(options[0].index).toBe(3);
  });

  it('refines the language by the variant in the title, so a dub is remembered', () => {
    const options = audioOptions(engine({}), item([track({ title: 'VFF 5.1' })]), t);

    expect(options[0].prefCode).toBe('fr-FR');
  });

  it('falls back to a numbered label when the track says nothing at all', () => {
    const options = audioOptions(
      engine({}),
      item([track({ language: null, codec: '', channels: null })]),
      t,
    );

    expect(options[0].label).toBe('#1');
  });
});

describe('the audio picker over an offline download', () => {
  it('numbers the tracks the way the local file does, not the way the server did', () => {
    const local = [{ language: 'fra', label: 'VF' }, { language: 'eng' }] as LocalAudioTrack[];

    const options = audioOptions(
      engine({ offline: true, localAudio: local }),
      item([track({ index: 7 }), track({ index: 9, language: 'eng' })]),
      t,
    );

    expect(options.map((o) => o.index)).toEqual([0, 1]);
  });

  it('borrows the server label when the two track lists line up', () => {
    const local = [{ language: 'fra', label: 'track 1' }] as LocalAudioTrack[];

    const options = audioOptions(
      engine({ offline: true, localAudio: local }),
      item([track({ title: 'Français VFF' })]),
      t,
    );

    expect(options[0].label).toBe('Français VFF · 5.1 · EAC3');
  });

  it('reads the local label when the counts disagree, since the pairing is a guess', () => {
    const local = [{ language: 'fra', label: 'VF' }, { language: 'eng' }] as LocalAudioTrack[];

    const options = audioOptions(
      engine({ offline: true, localAudio: local }),
      item([track({ title: 'Français VFF' })]),
      t,
    );

    expect(options.map((o) => o.label)).toEqual(['VF', 'Anglais']);
  });

  it('numbers a local track that carries neither label nor language', () => {
    const local = [{ language: null, label: '  ' }] as unknown as LocalAudioTrack[];

    const options = audioOptions(engine({ offline: true, localAudio: local }), item([]), t);

    expect(options[0].label).toBe('#1');
  });
});

describe('the subtitle button', () => {
  it('says subtitles are off when none is picked', () => {
    expect(subtitleLabel(subs({}), t)).toBe('Désactivés');
  });

  it('names the picked track by its own label', () => {
    const tracks = [{ index: 2, language: 'fra', url: '', label: 'Forcés' }];

    expect(subtitleLabel(subs({ active: 2, tracks }), t)).toBe('Forcés');
  });

  it('falls back to the language when the track carries no label', () => {
    const tracks = [{ index: 2, language: 'fra', url: '' }];

    expect(subtitleLabel(subs({ active: 2, tracks }), t)).toBe('Français');
  });

  it('numbers a picked track the list no longer holds', () => {
    expect(subtitleLabel(subs({ active: 4, tracks: [] }), t)).toBe('#5');
  });
});

describe('the note under a subtitle row', () => {
  it('stays absent for a track that is ready', () => {
    expect(subNote(t, subs({ active: 1 }), 1)).toBeUndefined();
  });

  it('marks a track whose cues could not be fetched', () => {
    expect(subNote(t, subs({ failed: new Set([1]) }), 1)).toBe('Indisponible');
  });

  it('marks only the row being prepared, not its neighbours', () => {
    const preparing = subs({ active: 1, loading: true });

    expect(subNote(t, preparing, 1)).toBe('Préparation');
    expect(subNote(t, preparing, 2)).toBeUndefined();
  });
});

describe('the quality suffix on the title line', () => {
  it('says nothing for a title with no video track', () => {
    expect(qualityBadge({ video: null } as MediaItem)).toBe('');
  });

  it('reads the height, the codec and HDR, separated from the title', () => {
    const movie = { video: { height: 2160, codec: 'hevc', hdr: true } } as MediaItem;

    expect(qualityBadge(movie)).toBe(' · 2160p HEVC HDR');
  });

  it('drops the parts the track does not know', () => {
    const movie = { video: { height: null, codec: 'h264', hdr: false } } as MediaItem;

    expect(qualityBadge(movie)).toBe(' · H264');
  });

  it('says nothing when the track knows nothing worth showing', () => {
    const movie = { video: { height: null, codec: '', hdr: false } } as MediaItem;

    expect(qualityBadge(movie)).toBe('');
  });
});
