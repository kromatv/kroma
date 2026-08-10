import { describe, expect, it } from 'vitest';
import {
  activeCueText,
  type Cue,
  isTextSubtitle,
  parseVtt,
  subtitleEtaTime,
  subtitleStageKey,
} from './subtitles';

describe('isTextSubtitle', () => {
  it('accepts known text codecs', () => {
    for (const c of ['subrip', 'srt', 'ass', 'ssa', 'mov_text', 'webvtt', 'vtt']) {
      expect(isTextSubtitle(c)).toBe(true);
    }
  });

  it('rejects image / unknown codecs', () => {
    expect(isTextSubtitle('pgs')).toBe(false);
    expect(isTextSubtitle('hdmv_pgs_subtitle')).toBe(false);
    expect(isTextSubtitle('dvd_subtitle')).toBe(false);
    expect(isTextSubtitle('')).toBe(false);
  });
});

describe('parseVtt', () => {
  it('parses cues, strips markup, and sorts by start time', () => {
    const raw = [
      'WEBVTT',
      '',
      '00:00:05.000 --> 00:00:07.000',
      'Second <i>cue</i>',
      '',
      '00:00:01.000 --> 00:00:02.500',
      'First {\\an8}line',
    ].join('\n');
    expect(parseVtt(raw)).toEqual([
      { start: 1, end: 2.5, text: 'First line' },
      { start: 5, end: 7, text: 'Second cue' },
    ]);
  });

  it('accepts a cue index line and MM:SS timestamps with comma millis', () => {
    // MM:SS, not HH:MM: 01:30 is 90 s.
    const raw = ['1', '01:30,000 --> 01:45,500', 'Hi'].join('\n');
    expect(parseVtt(raw)).toEqual([{ start: 90, end: 105.5, text: 'Hi' }]);
  });

  it('normalizes CRLF line endings', () => {
    const raw = 'WEBVTT\r\n\r\n00:00:00.000 --> 00:00:01.000\r\nHello';
    expect(parseVtt(raw)).toEqual([{ start: 0, end: 1, text: 'Hello' }]);
  });

  it('drops blocks with no timing line, empty text, or a non-positive span', () => {
    const raw = [
      'NOTE just a comment',
      '',
      '00:00:03.000 --> 00:00:03.000', // end == start → dropped
      'zero span',
      '',
      '00:00:04.000 --> 00:00:05.000',
      '<i></i>', // markup-only → empty text → dropped
      '',
      '00:00:06.000 --> 00:00:07.000',
      'kept',
    ].join('\n');
    expect(parseVtt(raw)).toEqual([{ start: 6, end: 7, text: 'kept' }]);
  });

  it('returns an empty list for empty / junk input', () => {
    expect(parseVtt('')).toEqual([]);
    expect(parseVtt('no cues here at all')).toEqual([]);
  });

  it('counts an unreadable timestamp field as zero instead of dropping the cue', () => {
    const raw = ['00:xx:05.000 --> 00:00:07.000', 'Still readable'].join('\n');
    expect(parseVtt(raw)).toEqual([{ start: 5, end: 7, text: 'Still readable' }]);
  });
});

describe('activeCueText', () => {
  const cues: Cue[] = [
    { start: 0, end: 2, text: 'A' },
    { start: 2, end: 4, text: 'B' },
    { start: 4, end: 6, text: 'C' },
    { start: 10, end: 12, text: 'D' },
  ];

  it('returns empty for an empty cue list', () => {
    expect(activeCueText([], 5, 0)).toEqual({ text: '', index: 0 });
  });

  it('fast-paths when still inside the hinted cue', () => {
    expect(activeCueText(cues, 1, 0)).toEqual({ text: 'A', index: 0 });
  });

  it('walks forward one cue during normal playback', () => {
    expect(activeCueText(cues, 3, 0)).toEqual({ text: 'B', index: 1 });
  });

  it('reports a gap (no active cue) while keeping the hint', () => {
    // t=8 sits between cue C (ends 6) and cue D (starts 10).
    expect(activeCueText(cues, 8, 2)).toEqual({ text: '', index: 2 });
  });

  it('binary-searches after a large forward jump beyond the walk window', () => {
    // From hint 0, cue D is more than the 3-cue walk window away.
    expect(activeCueText(cues, 11, 0)).toEqual({ text: 'D', index: 3 });
  });

  it('binary-searches after a backward seek', () => {
    expect(activeCueText(cues, 1, 3)).toEqual({ text: 'A', index: 0 });
  });

  it('binary-search returns the nearest lower index past the last cue', () => {
    const hit = activeCueText(cues, 13, 0);
    expect(hit.text).toBe('');
    expect(hit.index).toBe(3);
  });
});

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
