#!/usr/bin/env bun

// Emit the `cargo build` commands that produce every sidecar module's native
// binary, one per line, derived from each module's Cargo.toml. CI runs them
// inside the musl cross-toolchain image, then packs the results on the host.
//
//   KMOD_TARGET=x86_64-unknown-linux-musl bun run scripts/kmod-build-plan.ts

import { crateAndBin, packableModules } from './pack-module';

const target = process.env.KMOD_TARGET?.trim();
const targetArg = target ? ` --target ${target}` : '';

const packages: string[] = [];
const features: string[] = [];
for (const dir of packableModules()) {
  const { pkg, bin, features: feats } = crateAndBin(dir);
  if (!bin) continue; // library module: nothing to compile
  packages.push(`-p ${pkg}`);
  // Package-qualified: cargo rejects a bare `--features local` as ambiguous
  // across packages.
  features.push(...feats.map((f) => `${pkg}/${f}`));
}

// ONE invocation, not one per module: `lto = true` with `codegen-units = 1`
// makes each link single-threaded, so separate cargo commands would run
// sequentially; selecting every package lets cargo link them in parallel.
const feat = features.length ? ` --features ${features.join(',')}` : '';
process.stdout.write(
  `cargo build --profile release-kmod ${packages.join(' ')}${feat}${targetArg}\n`,
);
