// Which loop `bun run server:watch` runs, and why there are two.
//
// With the Dioxus CLI on PATH the server runs under `dx serve --hot-patch`: an
// edit under server/src is compiled on its own and linked as a patch into the
// running process, so the binary is never relinked and the process never
// restarts. Everything under server/crates, and any change that moves a type, a
// signature or a dependency, still costs a full rebuild.
//
// Without it, or with KROMA_HOTPATCH=0, the loop is `cargo watch -x run`: a
// fresh clone runs `bun run dev` with no extra tooling.

const serverDir = new URL('.', import.meta.url).pathname;

// Deno ships a `dx` too, and on a machine where homebrew precedes ~/.cargo/bin
// it wins the PATH lookup, so `cargo install dioxus-cli` would land a binary
// that never gets used. Both candidates are tried, and only one that answers
// `--version` with "dioxus" drives the loop.
function dioxusCli(): string | null {
  const candidates = [Bun.which('dx'), `${process.env.HOME}/.cargo/bin/dx`];
  for (const dx of candidates) {
    if (!dx) continue;
    try {
      const probe = Bun.spawnSync([dx, '--version']);
      const said = probe.stdout.toString() + probe.stderr.toString();
      if (said.toLowerCase().includes('dioxus')) return dx;
    } catch {
      // Not installed at that path, or not runnable. Try the next candidate.
    }
  }
  return null;
}

const dx = process.env.KROMA_HOTPATCH === '0' ? null : dioxusCli();

if (dx) {
  console.log('[dev] hot patching: an edit under server/src reaches the running process, no restart.');
  console.log('[dev] `dx` keeps its own build cache, so the first run is a full build.');
} else if (process.env.KROMA_HOTPATCH !== '0') {
  console.log('[dev] no Dioxus CLI: full rebuild on every edit.');
  console.log('[dev] for hot patching: cargo install dioxus-cli@0.7.10 --locked');
}

// `cargo watch` with no -w walks everything below server/ to build its watch
// list, which means crawling target/ before it runs anything. Naming the source
// paths keeps it out of any build directory, dead or live.
const argv = dx
  ? [dx, 'serve', '--hot-patch', '--interactive=false', '--open=false', '--json-output', '--features', 'hotpatch', '--package', 'kroma-server']
  : ['cargo', 'watch', '--why', '-w', 'src', '-w', 'crates', '-w', 'Cargo.toml', '-x', 'run'];

console.log(`[dev] ${dx ? 'dx' : 'cargo'} starting, first build is a full one`);

const child = Bun.spawn(argv, {
  cwd: serverDir,
  // `dx` runs the binary from inside a .app bundle, so the process CWD is not
  // server/ and the default `./data` would put the dev library somewhere else
  // on each loop. Both loops get the same absolute path instead.
  env: { ...process.env, KROMA_DATA_DIR: process.env.KROMA_DATA_DIR ?? `${serverDir}data` },
  stdio: [dx ? 'ignore' : 'inherit', dx ? 'pipe' : 'inherit', 'inherit'],
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => child.kill(signal));
}

// dx's own keys (`r`, `p`, `v`) need a terminal it does not get under
// `concurrently`, and it advertises them anyway. Reading its JSON events lets
// that banner go and leaves the build status and the server's own log.
if (dx && child.stdout) {
  const verbose = process.env.KROMA_HOTPATCH_VERBOSE === '1';
  let pending = '';
  for await (const chunk of child.stdout as ReadableStream<Uint8Array>) {
    pending += new TextDecoder().decode(chunk, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let event: { level?: string; message?: string } | null = null;
      try {
        event = JSON.parse(line);
      } catch {
        console.log(line);
        continue;
      }
      const message = event?.message ?? '';
      if (message.includes('to exit the server')) continue;
      if (event?.level === 'DEBUG' && !verbose) continue;
      console.log(message);
    }
  }
}

process.exit(await child.exited);
