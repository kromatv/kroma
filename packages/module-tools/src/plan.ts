#!/usr/bin/env bun

// Emit the `cargo build` commands that produce every sidecar module's native
// binary, derived from each module's Cargo.toml. CI runs them inside the musl
// cross-toolchain image, then packs the results on the host.
//
//   KMOD_TARGET=x86_64-unknown-linux-musl bun run modules plan
//
// Run the emitted script from the REPO ROOT (its paths are relative to it), not
// from server/. That is also what lets a container mounting the repo elsewhere
// run it unchanged: an absolute host path would write into the container's own
// filesystem and vanish with it.

import { relative } from 'node:path';
import { cargoBuild, crateAndBin, KMOD_TARGET_DIR, packableModules } from './pack';
import { root } from './root';

const target = process.env.KMOD_TARGET?.trim() || null;

// One invocation per module: each is its own workspace, so none can select them
// all. They share a target dir, which cargo locks, so the builds run in sequence.
const lines = [`export CARGO_TARGET_DIR="$PWD/${relative(root, KMOD_TARGET_DIR)}"`];

for (const dir of packableModules()) {
  const { bin, features } = crateAndBin(dir);
  if (!bin) continue; // library module: nothing to compile
  // The packer's own argv, so a `KMOD_SKIP_BUILD=1` pack finds the artifact
  // exactly where this plan put it.
  const { args } = cargoBuild(bin, features, target);
  const manifest = relative(root, `${dir}/server/Cargo.toml`);
  lines.push(`cargo ${args.join(' ')} --manifest-path ${manifest}`);
}

process.stdout.write(`${lines.join('\n')}\n`);
