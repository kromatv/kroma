import { $ } from 'bun';
import { setTimeout as delay } from 'node:timers/promises';
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
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await $`npm ${args}`.nothrow();
      if (result.exitCode === 0) return;
      const output = result.stdout.toString() + result.stderr.toString();
      // A duplicate Rekor entry does not mean npm stored the package. Start a
      // fresh publish (and attestation), keeping provenance enabled.
      const conflict =
        output.includes('TLOG_CREATE_ENTRY_ERROR') &&
        output.includes('equivalent entry already exists in the transparency log');
      if (!provenance || dryRun || !conflict || attempt === 3) {
        throw new Error(`npm publish failed (exit ${result.exitCode}): ${output}`);
      }
      console.warn(`npm provenance log conflict; retrying publish (${attempt}/3).`);
      await delay(attempt * 10_000);
    }
  },
};
