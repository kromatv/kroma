import type { AudioTrack, MediaItem, Translate, VideoTrack } from '@kroma/core';
import { describe, expect, it } from 'vitest';
import { audioFlagLabel, audioString, qualityBadges, subString } from './media-labels';

const NAMES: Record<string, string> = {
  'lang.fr': 'Français',
  'lang.en': 'Anglais',
  'content.audioHighDynamics': 'Écarts marqués',
  'content.audioQuietDialog': 'Dialogues bas',
  'subtitle.none': 'Aucun',
};
const t = ((key: string) => NAMES[key] ?? key) as Translate;

const video = (fields: Partial<VideoTrack>): VideoTrack => ({
  codec: 'h264',
  width: 1920,
  height: 1080,
  hdr: false,
  bitDepth: 8,
  ...fields,
});

const audio = (fields: Partial<AudioTrack>): AudioTrack => ({
  index: 0,
  codec: 'aac',
  channels: 2,
  language: 'fra',
  title: null,
  default: true,
  ...fields,
});

describe('the quality pills beside the meta line', () => {
  it('shows nothing for a title with no video track', () => {
    expect(qualityBadges(null)).toEqual([]);
  });

  it('leaves a 1080p SDR H.264 title unmarked', () => {
    expect(qualityBadges(video({}))).toEqual([]);
  });

  it('reads width rather than height, so a scope 4K master still counts', () => {
    expect(qualityBadges(video({ width: 3840, height: 1608 }))).toEqual(['4K']);
  });

  it('stacks every pill a 4K HDR H.265 master earns, widest first', () => {
    expect(qualityBadges(video({ width: 3840, hdr: true, codec: 'hevc' }))).toEqual([
      '4K',
      'HDR',
      'H.265',
    ]);
  });
});

describe('the audio line', () => {
  it('reads a dash when the title has no audio track', () => {
    expect(audioString(t, { audio: null })).toBe('-');
  });

  it('names the language first, then the codec and the layout', () => {
    expect(audioString(t, { audio: audio({ codec: 'eac3', channels: 6 }) })).toBe(
      'Français · EAC3 5.1',
    );
  });

  it('drops the separator when the language is the only thing known', () => {
    expect(audioString(t, { audio: audio({ codec: '', channels: null }) })).toBe('Français');
  });

  it('falls back to the technical half when the track names no language', () => {
    expect(audioString(t, { audio: audio({ language: null }) })).toBe('AAC 2.0');
  });
});

describe('the loudness warning pill', () => {
  it('stays silent for a mix nothing is wrong with', () => {
    expect(audioFlagLabel(t, { audioAnalysis: null })).toBeNull();
  });

  it('stays silent for a title the pipeline has not measured', () => {
    expect(audioFlagLabel(t, undefined)).toBeNull();
  });

  it('names the verdict when the dialog sits too low', () => {
    const analysis = { lufsI: -27, lra: 14, truePeak: -1, verdict: 'quietDialog' } as const;

    expect(audioFlagLabel(t, { audioAnalysis: analysis })).toBe('Dialogues bas');
  });

  it('names the verdict when the range is too wide', () => {
    const analysis = { lufsI: -24, lra: 22, truePeak: -1, verdict: 'highDynamics' } as const;

    expect(audioFlagLabel(t, { audioAnalysis: analysis })).toBe('Écarts marqués');
  });
});

describe('the subtitle line', () => {
  const sub = (language: string | null): MediaItem['subtitles'][number] => ({
    language,
    codec: 'subrip',
  });

  it('says so when the title carries no subtitles', () => {
    expect(subString(t, { subtitles: [] })).toBe('Aucun');
  });

  it('names each language once, however many tracks spell it', () => {
    expect(subString(t, { subtitles: [sub('fra'), sub('fre'), sub('eng')] })).toBe(
      'Français, Anglais',
    );
  });

  it('drops a track with no language rather than showing a gap', () => {
    expect(subString(t, { subtitles: [sub(null), sub('fra')] })).toBe('Français');
  });
});
