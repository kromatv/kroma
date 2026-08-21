import { dsmVersion, type Entry, entryVersion } from '#site/lib/catalog';

export type Release = {
  channel: 'stable' | 'canary';
  version: string;
  day: string;
  size: string;
  spk: string;
  release: string;
  notes: string;
  md5: string | null;
};

export const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

export function toRelease(e: Entry): Release {
  return {
    channel: e.channel,
    version: dsmVersion(entryVersion(e)),
    day: e.publishedAt ? e.publishedAt.slice(0, 10) : '',
    size: mb(e.info?.size ?? e.spkSize),
    spk: e.spkUrl,
    release: e.releaseUrl,
    notes: e.notes,
    md5: e.info?.md5 ?? null,
  };
}
