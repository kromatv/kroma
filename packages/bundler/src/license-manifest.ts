import type { LicenseEntry, Licenses } from '@kromatv/client/licenses';
import type { Notice } from './notices.ts';

/** The notices of one ecosystem, as one build collected them. */
export interface NoticeGroup {
  kind: LicenseEntry['kind'];
  notices: readonly Notice[];
}

const GITHUB_SHORTHAND = /^(?:github:)?([\w.-]+\/[\w.-]+)$/;

function withoutFragment(address: string): string {
  const at = address.indexOf('#');
  return at < 0 ? address : address.slice(0, at);
}

/**
 * A manifest's `repository` or `homepage` as a web address: the shorthands
 * and git spellings of a GitHub repository become its page, and anything
 * that still is not http(s) is dropped rather than linked.
 */
export function webAddress(raw: string | null): string | null {
  const trimmed = raw?.trim() ?? '';
  const shorthand = GITHUB_SHORTHAND.exec(trimmed);
  if (shorthand) {
    return `https://github.com/${shorthand[1]}`;
  }
  const url = withoutFragment(trimmed)
    .replace(/^git\+/, '')
    .replace(/^(?:ssh:\/\/)?git@github\.com[:/]/, 'https://github.com/')
    .replace(/^git:\/\//, 'https://')
    .replace(/\.git$/, '');
  return /^https?:\/\//.test(url) ? url : null;
}

/**
 * `third-party-licenses.json`: every package in name order, each distinct
 * text once and every package pointing at the texts it ships, in the shape
 * `@kromatv/client/licenses` reads.
 */
export function licenseManifest(groups: readonly NoticeGroup[]): Licenses {
  const texts: string[] = [];
  const indexOf = (text: string) => {
    const known = texts.indexOf(text);
    return known >= 0 ? known : texts.push(text) - 1;
  };
  const entries = groups
    .flatMap(({ kind, notices }) => notices.map((notice) => ({ kind, notice })))
    .sort((a, b) => a.notice.name.localeCompare(b.notice.name) || a.kind.localeCompare(b.kind))
    .map(({ kind, notice }) => ({
      kind,
      name: notice.name,
      version: notice.version,
      license: notice.license,
      source: webAddress(notice.source),
      texts: notice.texts.map(indexOf),
    }));
  return { texts, entries };
}
