#!/usr/bin/env bun

// Emit the `cargo build` commands that produce every sidecar module's native
// binary, one per line. CI runs these INSIDE the musl cross-toolchain image
// (messense/rust-musl-cross, the same image the Synology .spk build uses, which
// is proven to link candle / librqbit for musl), then packs the results on the
// host with `KMOD_SKIP_BUILD=1 bun run modules:pack`. Keeping the plan derived
// from each module's Cargo.toml (via the shared pack-module helpers) means new
// modules and feature changes need no workflow edit.
//
//   KMOD_TARGET=x86_64-unknown-linux-musl bun run scripts/kmod-build-plan.ts
//
// Output (stdout): shell command lines. Library modules (no [[bin]]) are skipped.

import { crateAndBin, packableModules } from './pack-module';

const target = process.env.KMOD_TARGET?.trim();
const targetArg = target ? ` --target ${target}` : '';

const packages: string[] = [];
const features: string[] = [];
for (const dir of packableModules()) {
  const { pkg, bin, features: feats } = crateAndBin(dir);
  if (!bin) continue; // library module: nothing to compile
  packages.push(`-p ${pkg}`);
  // PACKAGE-QUALIFIED, because one invocation builds all nine: a bare
  // `--features local` would be ambiguous across nine packages, and cargo
  // rejects it.
  features.push(...feats.map((f) => `${pkg}/${f}`));
}

// ONE invocation, not one per module, and the difference is not the dependency
// graph - it is the LINKER. The release profile is `lto = true` with
// `codegen-units = 1`, so each binary's link step is single-threaded and, run as
// nine separate cargo commands, they were also SEQUENTIAL: nine slow links, one
// after another, on a runner with cores sitting idle. Selecting all nine
// packages in one build lets cargo run those links in parallel, which is most of
// what the ~8 minute cross-compile step was spending its time on.
//
// The tradeoff is feature unification: with every package selected at once,
// cargo (resolver v2) unifies features across the shared dependencies of all
// nine, so a binary can link a dependency with a feature another module asked
// for. Cargo features are additive by contract, so this is a size question
// rather than a behaviour one.
const feat = features.length ? ` --features ${features.join(',')}` : '';
process.stdout.write(
  `cargo build --profile release-kmod ${packages.join(' ')}${feat}${targetArg}\n`,
);
