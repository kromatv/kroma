// `modules watch [id]`: the module dev loop. Rebuild a sidecar on save and drop
// the binary where the running server picks it up. With no id, every module with
// a sidecar is watched, so you never have to say which one you are editing.
//
// Nothing here restarts anything. The server's supervisor watches each running
// module's binary and hot-restarts the one that changed (`spawn_hot_reload`,
// gated on KROMA_MODULE_HOT_RELOAD=1), so writing the file IS the deploy.
//
// A debug build, not `release-kmod`: this is for iterating, and a debug rebuild
// of one module's own crate is ~1s against the warm shared target dir where a
// release rebuild is ~10s. Editing a SHARED crate (the SDK) still costs a full
// downstream rebuild - that is the dep graph, not this script.

import { copyFileSync, existsSync, mkdirSync, readFileSync, watch } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { $ } from 'bun';
import { crateAndBin, KMOD_TARGET_DIR, packableModules } from './pack';
import { root } from './root';

// Long enough to coalesce an editor's write burst, short enough to feel instant.
const DEBOUNCE_MS = 120;

interface Watched {
  dir: string;
  id: string;
  bin: string;
}

/** Where the running server loads a module's binary from. */
function installedBinary(id: string): string {
  const dataDir = process.env.KROMA_DATA_DIR?.trim() || join(root, 'server/data');
  return join(dataDir, 'modules', id, 'module');
}

function watchable(id?: string): Watched[] {
  const dirs = packableModules().filter((dir) => !id || basename(dir) === id);
  if (dirs.length === 0) {
    const known = packableModules()
      .map((d) => basename(d))
      .join('\n  ');
    throw new Error(`unknown module '${id}'. Modules with a sidecar:\n  ${known}`);
  }
  return dirs.flatMap((dir) => {
    const { bin } = crateAndBin(dir);
    if (!bin) return [];
    const manifest = JSON.parse(readFileSync(join(dir, 'module.json'), 'utf8')) as {
      id: string;
    };
    return [{ dir, id: manifest.id, bin }];
  });
}

async function rebuild(m: Watched): Promise<void> {
  const started = Date.now();
  const built = await $`cargo build --bin ${m.bin}`
    .cwd(join(m.dir, 'server'))
    .env({ ...process.env, CARGO_TARGET_DIR: KMOD_TARGET_DIR })
    .nothrow();
  if (built.exitCode !== 0) {
    console.error(`  ${m.id}: build failed - the running binary is left alone`);
    return;
  }
  const to = installedBinary(m.id);
  mkdirSync(dirname(to), { recursive: true });
  // The supervisor polls this path's mtime, so the copy IS the restart trigger.
  copyFileSync(join(KMOD_TARGET_DIR, 'debug', m.bin), to);
  console.log(`  ${m.id}: rebuilt + installed in ${Date.now() - started}ms`);
}

/** Serialise rebuilds: they share one CARGO_TARGET_DIR, hence one cargo lock. */
function queue(): (m: Watched) => void {
  let running = false;
  const pending = new Map<string, Watched>();
  const drain = async () => {
    running = true;
    while (pending.size > 0) {
      const [key, m] = [...pending.entries()][0] as [string, Watched];
      pending.delete(key);
      await rebuild(m);
    }
    running = false;
  };
  return (m) => {
    pending.set(m.id, m);
    if (!running) void drain();
  };
}

/** `modules watch [id]`: rebuild + install a module's sidecar on every save. */
export async function main(args: string[]): Promise<void> {
  const modules = watchable(args[0]);
  const push = queue();

  for (const m of modules) {
    if (!existsSync(installedBinary(m.id))) {
      console.warn(`warning: ${m.id} is not installed; run bun run modules:pack once`);
    }
    const src = join(m.dir, 'server/src');
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    watch(src, { recursive: true }, (_event, file) => {
      if (!file?.endsWith('.rs')) return;
      const t = timers.get(m.id);
      if (t) clearTimeout(t);
      timers.set(
        m.id,
        setTimeout(() => {
          console.log(`\n${m.id}: ${file} changed`);
          push(m);
        }, DEBOUNCE_MS),
      );
    });
  }

  console.log(`watching ${modules.length} module(s) for changes`);
  console.log('the server hot-restarts a sidecar on write (KROMA_MODULE_HOT_RELOAD=1)\n');

  // Hold the process open for the watchers.
  await new Promise<never>(() => {});
}
