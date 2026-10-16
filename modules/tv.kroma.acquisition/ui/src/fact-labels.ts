import type { HdrFormat, Resolution, Source, VideoCodec } from './rules-schemas';

const LABEL: Record<Resolution | Source | VideoCodec | HdrFormat, string> = {
  Sd: 'SD',
  R720: '720p',
  R1080: '1080p',
  R2160: '2160p',
  Remux: 'Remux',
  BluRay: 'Blu-ray',
  WebDl: 'WEB-DL',
  WebRip: 'WEBRip',
  Hdtv: 'HDTV',
  Dvd: 'DVD',
  Cam: 'CAM',
  Hevc: 'HEVC',
  H264: 'H.264',
  Av1: 'AV1',
  Vp9: 'VP9',
  Xvid: 'Xvid',
  hdr10: 'HDR10',
  hdr10Plus: 'HDR10+',
  dolbyVision: 'Dolby Vision',
  hlg: 'HLG',
};

/** How a resolution, source, codec or HDR format is written for a person. */
export function factLabel(value: string): string {
  return LABEL[value as keyof typeof LABEL] ?? value;
}
