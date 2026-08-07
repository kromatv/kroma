#!/usr/bin/env bun

// Run one cargo subcommand across every module workspace. Modules are not
// members of the server workspace, so `cargo test --workspace` never reaches
// them. They share one target dir, so common deps compile once.
//
//   bun run modules cargo test
//   bun run modules cargo clippy --all-targets

import { existsSync } from 'node:fs';
import { $ } from 'bun';
import { KMOD_TARGET_DIR, packableModules } from './pack';

const args = process.argv.slice(2);
if (args.length === 0) throw new Error('usage: bun run modules cargo <cargo-subcommand> [args...]');

// Default features: the `[package.metadata.kmod]` ones pull candle and librqbit,
// which would roughly double this job for the five tests behind them (whisper 1,
// torrents 2, vector 2). Pass `--features` explicitly to include those.
const failed: string[] = [];
for (const dir of packableModules()) {
  const id = dir.split('/').pop() ?? dir;
  // A module may ship a frontend and no backend at all; there is nothing to run.
  if (!existsSync(`${dir}/server/Cargo.toml`)) continue;
  console.log(`\n=== ${id}: cargo ${args.join(' ')}`);
  const result = await $`cargo ${args}`
    .cwd(`${dir}/server`)
    .env({ ...process.env, CARGO_TARGET_DIR: KMOD_TARGET_DIR })
    .nothrow();
  if (result.exitCode !== 0) failed.push(id);
}

if (failed.length > 0) {
  console.error(`\ncargo ${args[0]} failed in ${failed.length} module(s): ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`\ncargo ${args[0]}: every module passed`);
