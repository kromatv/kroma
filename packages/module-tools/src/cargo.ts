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
import { root } from './root';

const args = process.argv.slice(2);
if (args.length === 0) throw new Error('usage: bun run modules cargo <cargo-subcommand> [args...]');

// Default features: the `[package.metadata.kmod]` ones pull candle and librqbit,
// which would roughly double this job for the five tests behind them (whisper 1,
// torrents 2, vector 2). Pass `--features` explicitly to include those.
// Every cargo workspace under modules/, as (label, directory). A module's is
// under its server/; `modules/lib` holds the shared libraries, which are not
// modules and have no manifest, so `packableModules` cannot see them and they
// would otherwise be the only Rust here that nothing checks.
function workspaces(): [string, string][] {
  const out: [string, string][] = [];
  for (const dir of packableModules()) {
    const id = dir.split('/').pop() ?? dir;
    // A module may ship a frontend and no backend at all; there is nothing to run.
    if (existsSync(`${dir}/server/Cargo.toml`)) out.push([id, `${dir}/server`]);
  }
  const libs = `${root}/modules/lib`;
  if (existsSync(`${libs}/Cargo.toml`)) out.push(['lib', libs]);
  return out;
}

const failed: string[] = [];
for (const [id, cwd] of workspaces()) {
  console.log(`\n=== ${id}: cargo ${args.join(' ')}`);
  const result = await $`cargo ${args}`
    .cwd(cwd)
    .env({ ...process.env, CARGO_TARGET_DIR: KMOD_TARGET_DIR })
    .nothrow();
  if (result.exitCode !== 0) failed.push(id);
}

if (failed.length > 0) {
  console.error(`\ncargo ${args[0]} failed in ${failed.length} module(s): ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`\ncargo ${args[0]}: every module passed`);
