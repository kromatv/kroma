import type { VideoTrack } from '@kromatv/client/media';
import { describe, expect, it } from 'vitest';
import { qualityBadges } from './quality-badges';

const video = (fields: Partial<VideoTrack>): VideoTrack => ({
  codec: 'h264',
  width: 1920,
  height: 1080,
  hdr: false,
  bitDepth: 8,
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
