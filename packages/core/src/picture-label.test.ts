import type { VideoTrack } from '@kromatv/client/media';
import { describe, expect, it } from 'vitest';
import { hdrLabel, pictureBadge, pictureFormat } from './picture-label';

const picture = (over: Partial<VideoTrack> = {}): VideoTrack => ({
  codec: 'hevc',
  width: 1920,
  height: 1080,
  hdr: false,
  bitDepth: 8,
  ...over,
});

describe('the HDR system a picture carries', () => {
  it.each([
    ['dolbyVision', 'Dolby Vision'],
    ['hdr10Plus', 'HDR10+'],
    ['hdr10', 'HDR10'],
    ['hlg', 'HLG'],
  ] as const)('names %s as a viewer knows it', (hdrFormat, name) => {
    expect(hdrLabel(picture({ hdr: true, hdrFormat }))).toBe(name);
  });

  it('says HDR where the file does not say which', () => {
    expect(hdrLabel(picture({ hdr: true }))).toBe('HDR');
  });

  it('names nothing for SDR', () => {
    expect(hdrLabel(picture())).toBeNull();
  });
});

describe('the picture line of the stats panel', () => {
  it('prints the codec, the bit depth and the HDR system', () => {
    const graded = picture({ hdr: true, bitDepth: 10, hdrFormat: 'dolbyVision' });

    expect(pictureFormat(graded)).toBe('HEVC 10-bit Dolby Vision');
  });

  it('prints a picture whose depth was never measured by its codec alone', () => {
    expect(pictureFormat(picture({ codec: 'h264', bitDepth: null }))).toBe('H264');
  });
});

describe('the quality badge of the player', () => {
  it('names the HDR system and a deep bit depth', () => {
    const graded = picture({ width: 3840, hdr: true, bitDepth: 10, hdrFormat: 'dolbyVision' });

    expect(pictureBadge(graded)).toBe('Dolby Vision · 10-bit');
  });

  it('falls back to what the catalogue badge names for SDR', () => {
    expect(pictureBadge(picture({ width: 3840 }))).toBe('4K');
  });

  it('adds a deep bit depth to an SDR picture', () => {
    expect(pictureBadge(picture({ bitDepth: 10 }))).toBe('H.265 · 10-bit');
  });

  it('names nothing for an 8-bit SDR picture in H.264', () => {
    expect(pictureBadge(picture({ codec: 'h264' }))).toBeNull();
  });

  it('names nothing without a picture', () => {
    expect(pictureBadge(null)).toBeNull();
  });
});
