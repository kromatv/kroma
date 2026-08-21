import type { IconComponent } from '#site/components/download/icon';
import type { CanaryFile } from '#site/lib/canary';
import { TARGET_IDS, TARGETS, type TargetId } from '#site/lib/release-targets';
import { megabytes, type SiteDownload } from '#site/lib/releases';

/**
 * One file a build hands over, as a row renders it.
 *
 * A release, a canary and a CI run describe their files differently - a release
 * has a checksum and a platform id, a run artifact has neither and arrives as a
 * zip. This is the part they agree on, so one row renders all three.
 */
export interface BuildFile {
  key: string;
  /** The platform's own name, for a list with no heading above it to say which. */
  platform: string;
  /** `.dmg`, or every extension inside when the file is an archive. */
  kind: string;
  /** Whatever else tells two files of one platform apart: size, architecture. */
  meta: string;
  url: string;
  /** The file's real name, for the accessible label. */
  name: string;
  /** The platform's glyph, or undefined for a file no platform claims. */
  icon?: IconComponent;
  /** 64 lowercase hex, or null when the file carries no published digest. */
  sha256?: string | null;
}

/** A released or canary installer. */
export function fromDownload(download: SiteDownload): BuildFile {
  const { ext, arch, label } = TARGETS[download.target];
  return {
    key: download.name,
    platform: label,
    kind: ext,
    meta: arch ? `${megabytes(download.bytes)} · ${arch}` : megabytes(download.bytes),
    url: download.url,
    name: download.name,
    icon: TARGETS[download.target].icon,
    sha256: download.sha256,
  };
}

/** A zip left on a CI run, which names a platform but no single file. */
export function fromCanaryFile(file: CanaryFile): BuildFile {
  return {
    key: file.target,
    platform: file.label,
    kind: file.contains.join(' '),
    meta: megabytes(file.bytes),
    url: file.url,
    name: `${file.label} (zip)`,
    icon: iconOf(file.target),
  };
}

const iconOf = (target: string) =>
  TARGET_IDS.includes(target as TargetId) ? TARGETS[target as TargetId].icon : undefined;
