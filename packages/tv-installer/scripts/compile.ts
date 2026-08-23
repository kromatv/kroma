import { $ } from 'bun';

const TARGETS = ['bun-darwin-arm64', 'bun-darwin-x64', 'bun-linux-x64', 'bun-windows-x64'];

const target = process.argv.find((arg) => arg.startsWith('--target='))?.slice('--target='.length);
if (target && !TARGETS.includes(target)) {
  console.error(`unknown target '${target}'\ntargets: ${TARGETS.join(', ')}`);
  process.exit(1);
}

const suffix = target ? `-${target.replace('bun-', '')}` : '';
const name = `kroma-tv${suffix}`;
const out = `dist/${name}${target?.includes('windows') ? '.exe' : ''}`;

await $`bun build --compile ${target ? ['--target', target] : []} ./src/cli.ts --outfile ${out}`;

// macOS kills a compiled binary whose ad-hoc signature it cannot validate, and
// the one `bun build` leaves behind is not one it accepts.
if (process.platform === 'darwin' && (target ?? 'bun-darwin').includes('darwin')) {
  await $`codesign --force --sign - ${out}`.quiet();
}

const { size } = await Bun.file(out).stat();
console.log(`${out}  ${(size / 1e6).toFixed(0)} MB`);
