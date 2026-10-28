import { basename } from 'node:path';

/** An update bundle and the minisign signature `tauri signer` wrote beside it. */
export interface Signed {
  name: string;
  signature: string;
}

/** The `latest.json` the Tauri updater reads. */
export interface Feed {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, { signature: string; url: string }>;
}

interface Kind {
  suffix: RegExp;
  os: 'darwin' | 'windows' | 'linux';
  installer: string;
  generic: boolean;
}

const KINDS: readonly Kind[] = [
  { suffix: /\.app\.tar\.gz$/, os: 'darwin', installer: 'app', generic: true },
  { suffix: /-setup\.exe$/, os: 'windows', installer: 'nsis', generic: true },
  { suffix: /\.msi$/, os: 'windows', installer: 'msi', generic: false },
  { suffix: /\.AppImage$/, os: 'linux', installer: 'appimage', generic: true },
  { suffix: /\.deb$/, os: 'linux', installer: 'deb', generic: false },
];

const ARCH: Readonly<Record<string, string>> = {
  aarch64: 'aarch64',
  arm64: 'aarch64',
  x64: 'x86_64',
  amd64: 'x86_64',
  x86_64: 'x86_64',
};

const REQUIRED_PLATFORMS = [
  'darwin-aarch64',
  'darwin-x86_64',
  'windows-x86_64',
  'linux-x86_64',
] as const;

/** The CPU a bundle name says it is for, in the updater's spelling, or null. */
export function archOf(name: string): string | null {
  const found = /_(aarch64|arm64|x64|amd64|x86_64)(?=[._-])/.exec(name)?.[1];
  return found === undefined ? null : (ARCH[found] ?? null);
}

/**
 * The updater keys a bundle answers. The installer-specific key comes first,
 * the one an app that knows how it was installed asks for; the generic key goes
 * to the installer an older app should get, which is the one tauri-action
 * chose for this feed before (NSIS, the AppImage).
 */
export function keysOf(name: string): string[] {
  const kind = KINDS.find((k) => k.suffix.test(name));
  const arch = archOf(name);
  if (!kind || !arch) return [];
  const platform = `${kind.os}-${arch}`;
  return kind.generic
    ? [`${platform}-${kind.installer}`, platform]
    : [`${platform}-${kind.installer}`];
}

/**
 * The update bundles among `paths` that have a `.sig` beside them, each with
 * the path of that signature. Anything else (a .dmg, a stale tauri tarball
 * with no signature) is not a bundle the feed serves.
 */
export function signedBundles(paths: readonly string[]): { bundle: string; sig: string }[] {
  const present = new Set(paths);
  return paths
    .filter((path) => keysOf(basename(path)).length > 0 && present.has(`${path}.sig`))
    .map((bundle) => ({ bundle, sig: `${bundle}.sig` }));
}

/** The feed for a set of signed bundles served from `baseUrl`. */
export function feed(
  bundles: readonly Signed[],
  version: string,
  baseUrl: string,
  pubDate: Date,
  notes: string,
): Feed {
  const platforms: Feed['platforms'] = {};
  for (const bundle of bundles) {
    const name = basename(bundle.name);
    const keys = keysOf(name);
    if (keys.length === 0) throw new Error(`${name} is not an update bundle this feed knows`);
    for (const key of keys) {
      if (platforms[key]) throw new Error(`two bundles answer ${key}`);
      platforms[key] = {
        signature: bundle.signature.trim(),
        url: `${baseUrl}/${encodeURIComponent(name)}`,
      };
    }
  }
  const missing = REQUIRED_PLATFORMS.filter((key) => !platforms[key]);
  if (missing.length > 0) throw new Error(`no bundle for ${missing.join(', ')}`);
  return { version, notes, pub_date: pubDate.toISOString(), platforms };
}
