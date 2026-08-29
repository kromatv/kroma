import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const SHELL = fileURLToPath(new URL('../../../clients/tv-web', import.meta.url));
const READY_TIMEOUT_MS = 90_000;
// The running bun, by absolute path: what serves the shell must not be whatever
// a writable PATH resolves `bunx` to.
const BUN = process.execPath;

interface Serving {
  url: string;
  stop(): void;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => (port ? resolve(port) : reject(new Error('no free port'))));
    });
  });
}

async function answering(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return /kroma/i.test(await res.text());
  } catch {
    return false;
  }
}

/**
 * The TV shell on a port nothing else holds, as a DEV server: a production
 * build drops every console call (see `dropConsole` in bundler/shell.ts), which
 * would blind the console check to exactly the errors it exists to catch.
 */
export async function serveTvShell(): Promise<Serving> {
  const port = await freePort();
  // Its own process GROUP, and killed as one: `bun x` hands off to a node vite
  // that outlives its wrapper, so killing the child alone leaves a dev server
  // holding a port for the rest of the session.
  const vite = spawn(BUN, ['x', 'vite', '--port', String(port), '--strictPort'], {
    cwd: SHELL,
    stdio: 'ignore',
    detached: true,
  });
  let exited: number | null = null;
  vite.on('exit', (code) => {
    exited = code ?? 0;
  });
  const stop = () => {
    if (exited !== null || !vite.pid) return;
    try {
      process.kill(-vite.pid, 'SIGTERM');
    } catch {
      vite.kill();
    }
  };
  process.once('SIGINT', () => {
    stop();
    process.exit(130);
  });

  const url = `http://localhost:${port}`;
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited !== null) throw new Error(`the tv-web dev server exited (${exited})`);
    if (await answering(url)) return { url, stop };
    await new Promise((done) => setTimeout(done, 500));
  }
  stop();
  throw new Error(`the tv-web dev server did not answer ${url} in ${READY_TIMEOUT_MS}ms`);
}
