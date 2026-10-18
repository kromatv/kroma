// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useConditionText } from './condition-text';
import type { Condition } from './rules-schemas';

vi.mock('@kromatv/module-sdk', () => {
  const t = (key: string, params?: object) => (params ? `${key} ${JSON.stringify(params)}` : key);
  return { useT: () => t };
});

function read(condition: Record<string, unknown>) {
  const { result } = renderHook(() => useConditionText());
  return result.current({ negate: false, required: true, ...condition } as Condition);
}

describe('a condition text', () => {
  it('shows a pattern, or any when it is empty', () => {
    expect(read({ type: 'releaseGroup', pattern: 'GRP' })).toBe('acq.condition.releaseGroup = GRP');
    expect(read({ type: 'edition', pattern: '' })).toBe('acq.condition.edition = acq.anyValue');
  });

  it('names a language preset, or shows the raw tag', () => {
    expect(read({ type: 'language', value: 'fr-FR' })).toBe('acq.condition.language = acq.langVff');
    expect(read({ type: 'subtitle', value: 'de' })).toBe('acq.condition.subtitle = de');
    expect(read({ type: 'subtitle', value: '' })).toBe('acq.condition.subtitle = acq.anyValue');
  });

  it('writes a fact the way a release name does', () => {
    expect(read({ type: 'resolution', value: 'R1080' })).toBe('acq.condition.resolution = 1080p');
    expect(read({ type: 'source', value: 'WebDl' })).toBe('acq.condition.source = WEB-DL');
    expect(read({ type: 'hdr', value: 'dolbyVision' })).toBe('acq.condition.hdr = Dolby Vision');
    expect(read({ type: 'hdr', value: null })).toBe('acq.condition.hdr = acq.anyHdr');
  });

  it('translates a flag and a release type', () => {
    expect(read({ type: 'indexerFlag', value: 'freeleech' })).toBe(
      'acq.condition.indexerFlag = acq.flag.freeleech',
    );
    expect(read({ type: 'releaseType', value: 'seasonPack' })).toBe(
      'acq.condition.releaseType = acq.releaseType.seasonPack',
    );
  });

  it('joins the codec and the channel floor of an audio track', () => {
    expect(read({ type: 'audio', codec: 'dtsHdMa', minChannels: 6 })).toBe(
      'acq.condition.audio = DTS-HD MA · acq.channelsAtLeast {"count":6}',
    );
    expect(read({ type: 'audio', codec: null, minChannels: null })).toBe(
      'acq.condition.audio = acq.anyValue',
    );
  });

  it('writes a size range with whichever ends are set', () => {
    expect(read({ type: 'size', minGb: 1, maxGb: 5 })).toContain(
      'acq.rangeBetween {"from":"1 Go","to":"5 Go"}',
    );
    expect(read({ type: 'size', minGb: 1, maxGb: null })).toContain(
      'acq.rangeFrom {"from":"1 Go"}',
    );
    expect(read({ type: 'size', minGb: null, maxGb: 5 })).toContain('acq.rangeTo {"to":"5 Go"}');
    expect(read({ type: 'size', minGb: null, maxGb: null })).toContain('acq.anyValue');
  });

  it('writes a year range', () => {
    expect(read({ type: 'year', min: 1990, max: 1999 })).toContain(
      'acq.rangeBetween {"from":"1990","to":"1999"}',
    );
  });
});
