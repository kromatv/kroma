import { $ } from 'bun';
import { z } from 'zod';
import type { Registry } from './publish';

const Tarball = z.url();

export const npmRegistry: Registry = {
  async publishedTarball(name, tag) {
    const spec = `${name}@${tag}`;
    const view = await $`npm view ${spec} dist.tarball --json`.nothrow().quiet();
    const out = view.stdout.toString().trim();
    if (view.exitCode !== 0) {
      if (/E404|404/.test(view.stderr.toString() + out)) return null;
      throw new Error(`npm view ${name}@${tag} failed: ${view.stderr.toString().trim()}`);
    }
    if (!out) return null;
    const parsed = JSON.parse(out) as unknown;
    const url = Tarball.parse(Array.isArray(parsed) ? parsed.at(-1) : parsed);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} answered ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  },

  async publish(tarball, { tag, provenance, dryRun }) {
    const args = ['publish', tarball, '--access', 'public', '--tag', tag];
    if (provenance) args.push('--provenance');
    if (dryRun) args.push('--dry-run');
    console.log(`npm ${args.join(' ')}`);
    await $`npm ${args}`;
  },
};
