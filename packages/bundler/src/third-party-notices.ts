import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { cargoNotices } from './cargo-notices.ts';
import { renderNotices } from './notices.ts';
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

function cargoSection(manifest: string, targets: readonly string[]): string | null {
  try {
    return renderNotices('Rust crates', cargoNotices(manifest, targets));
  } catch (error) {
    if (process.env.CI) throw error;
    console.warn(`[third-party-notices] no Rust crates listed, cargo metadata failed: ${error}`);
    return null;
  }
}

/**
 * Write THIRD-PARTY-NOTICES.txt beside the build: the hand-written notices,
 * the crates the Rust program links, and every installed package the bundle
 * actually carries, each with its license text. Without cargo the Rust
 * section is left out with a warning, except under CI, where it fails the build.
 */
export function thirdPartyNotices(options: ThirdPartyNoticesOptions): Plugin {
  const { title, include = [], cargo, fileName = 'THIRD-PARTY-NOTICES.txt' } = options;
  let root = process.cwd();
  return {
    name: 'kroma:third-party-notices',
    apply: 'build',
    configResolved(config) {
      root = config.root;
    },
    generateBundle(_, bundle) {
      const ids = Object.values(bundle).flatMap((out) =>
        out.type === 'chunk' ? Object.keys(out.modules) : [],
      );
      const sections = [
        ...include.map((file) => readFileSync(resolve(root, file), 'utf8').trim()),
        cargo ? cargoSection(resolve(root, cargo.manifest), cargo.targets ?? []) : null,
        renderNotices('JavaScript packages', npmNotices(ids)),
      ].filter((section) => section !== null);
      this.emitFile({
        type: 'asset',
        fileName,
        source: `${[title, ...sections].join('\n\n\n')}\n`,
      });
    },
  };
}
