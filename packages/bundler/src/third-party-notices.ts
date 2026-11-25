import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin, Rollup } from 'vite';
import { assetNotices } from './asset-notices.ts';
import { cargoNotices } from './cargo-notices.ts';
import { licenseManifest } from './license-manifest.ts';
import { type Notice, renderNotices } from './notices.ts';
import { npmNotices } from './npm-notices.ts';

/**
 * `include` and `cargo.manifest` are relative to the config root; `cargo` is
 * the Rust program the app runs in and the targets it ships for (every target
 * when none are named).
 */
export interface ThirdPartyNoticesOptions {
  title: string;
  include?: string[];
  cargo?: { manifest: string; targets?: string[] };
  fileName?: string;
}

/** The JSON the licenses page reads, written beside the bundle's entry. */
export const LICENSES_FILE = 'third-party-licenses.json';

interface Collected {
  crates: Notice[] | null;
  packages: Notice[];
  assets: Notice[];
}

function linkedCrates(manifest: string, targets: readonly string[]): Notice[] | null {
  try {
    return cargoNotices(manifest, targets);
  } catch (error) {
    if (process.env.CI) {
      throw error;
    }
    console.warn(
      `[third-party-notices] no Rust crates listed, cargo metadata failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

function bundledModules(bundle: Rollup.OutputBundle): string[] {
  return Object.values(bundle).flatMap((out) =>
    out.type === 'chunk' ? Object.keys(out.modules) : [],
  );
}

function bundledFiles(bundle: Rollup.OutputBundle): string[] {
  return Object.values(bundle).flatMap((out) =>
    out.type === 'asset' ? out.originalFileNames : [],
  );
}

function textFile(title: string, written: readonly string[], collected: Collected): string {
  const sections = [
    ...written,
    ...(collected.crates ? [renderNotices('Rust crates', collected.crates)] : []),
    renderNotices('JavaScript packages', collected.packages),
    ...(collected.assets.length > 0 ? [renderNotices('Files', collected.assets)] : []),
  ];
  return `${[title, ...sections].join('\n\n\n')}\n`;
}

function jsonFile({ crates, packages, assets }: Collected): string {
  return JSON.stringify(
    licenseManifest([
      { kind: 'crate', notices: crates ?? [] },
      { kind: 'npm', notices: packages },
      { kind: 'asset', notices: assets },
    ]),
  );
}

/**
 * Write THIRD-PARTY-NOTICES.txt beside the client build: the hand-written
 * notices, the crates the Rust program links, every installed package the
 * bundle actually carries and every vendored file it emits that a
 * `third-party.json` names, each with its license text. The same packages go
 * to `third-party-licenses.json` for the licenses page. Without cargo the
 * Rust section is left out with a warning, except under CI, where it fails
 * the build.
 */
export function thirdPartyNotices(options: ThirdPartyNoticesOptions): Plugin {
  const { title, include = [], cargo, fileName = 'THIRD-PARTY-NOTICES.txt' } = options;
  let root = process.cwd();
  return {
    name: 'kroma:third-party-notices',
    apply: 'build',
    applyToEnvironment: (environment) => environment.name === 'client',
    configResolved(config) {
      root = config.root;
    },
    generateBundle(_, bundle) {
      const collected: Collected = {
        crates: cargo ? linkedCrates(resolve(root, cargo.manifest), cargo.targets ?? []) : null,
        packages: npmNotices(bundledModules(bundle)),
        assets: assetNotices(bundledFiles(bundle)),
      };
      const written = include.map((file) => readFileSync(resolve(root, file), 'utf8').trim());
      this.emitFile({ type: 'asset', fileName, source: textFile(title, written, collected) });
      this.emitFile({ type: 'asset', fileName: LICENSES_FILE, source: jsonFile(collected) });
    },
  };
}
