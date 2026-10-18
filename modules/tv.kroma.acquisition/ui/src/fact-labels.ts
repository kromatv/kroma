import type { AudioCodec, HdrFormat, Resolution, Source, VideoCodec } from './rules-schemas';

const LABEL: Record<Resolution | Source | VideoCodec | HdrFormat | AudioCodec, string> = {
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
  trueHd: 'TrueHD',
  dtsX: 'DTS:X',
  dtsHdMa: 'DTS-HD MA',
  dtsHd: 'DTS-HD',
  dts: 'DTS',
  eac3: 'E-AC3',
  ac3: 'AC3',
  aac: 'AAC',
  flac: 'FLAC',
  opus: 'Opus',
  pcm: 'PCM',
  mp3: 'MP3',
};

const QUALITY_SOURCE: Record<string, string> = {
  remux: 'Remux',
  bluray: 'Blu-ray',
  webdl: 'WEB-DL',
  webrip: 'WEBRip',
  hdtv: 'HDTV',
  sdtv: 'SDTV',
  dvd: 'DVD',
  cam: 'CAM',
};

const QUALITY_RESOLUTION: Record<string, string> = {
  sd: 'SD',
  '720p': '720p',
  '1080p': '1080p',
  '2160p': '2160p',
};

const SD_ONLY_SOURCES: ReadonlySet<string> = new Set(['cam', 'sdtv', 'dvd']);

export function factLabel(value: string): string {
  return LABEL[value as keyof typeof LABEL] ?? value;
}

/** How a quality id is written for a person: `webdl-1080p` as `WEB-DL 1080p`,
 *  and `unknown-720p` as the resolution alone. A quality naming neither a
 *  source nor a resolution has nothing to write, so it comes back null and the
 *  caller names it in the reader's language. */
export function qualityLabel(quality: string): string | null {
  const [head, tail] = quality.split('-');
  const resolution = QUALITY_RESOLUTION[tail ?? head ?? ''] ?? null;
  const source = QUALITY_SOURCE[head ?? ''] ?? null;
  if (source === null) return resolution;
  return resolution === null || tail === undefined ? source : `${source} ${resolution}`;
}

/** The resolution a quality sits at, including the sources that only ever
 *  existed in standard definition. Null when the id names none. */
export function qualityResolution(quality: string): string | null {
  const [head, tail] = quality.split('-');
  if (tail !== undefined) return QUALITY_RESOLUTION[tail] ?? null;
  if (SD_ONLY_SOURCES.has(head ?? '')) return QUALITY_RESOLUTION.sd ?? null;
  return QUALITY_RESOLUTION[head ?? ''] ?? null;
}
