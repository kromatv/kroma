import { dirname, normalize, posix } from 'node:path';

/** One file a crate pulls in at compile time, as a repo-relative path. */
export interface Embed {
  /** The Rust file that embeds it. */
  from: string;
  /** What it embeds, repo-relative. */
  path: string;
}

const INCLUDE =
  /include_(?:str|bytes)!\(\s*(?:concat!\(\s*env!\(\s*"CARGO_MANIFEST_DIR"\s*\)\s*,\s*)?"([^"]+)"/g;
const BUILD_SCRIPT_PATH = /"((?:\.\.\/)+packages\/[^"]+)"/g;

// A file's tests sit at its end under `#[cfg(test)]`, and are never compiled
// by a release build, so nothing past that line counts.
function shipped(source: string): string {
  const cut = source.indexOf('#[cfg(test)]');
  return cut === -1 ? source : source.slice(0, cut);
}

function crateDir(file: string): string {
  const src = file.indexOf('/src/');
  return src === -1 ? dirname(file) : file.slice(0, src);
}

/**
 * Every file under `packages/` that the given Rust sources embed at compile
 * time: `include_str!`/`include_bytes!` of a relative path, the same through
 * `concat!(env!("CARGO_MANIFEST_DIR"), …)`, and a build script's `../packages/…`
 * literals. `sources` maps repo-relative `.rs` paths to their text.
 */
export function embeds(sources: Record<string, string>): Embed[] {
  const found: Embed[] = [];
  for (const [file, text] of Object.entries(sources)) {
    const body = shipped(text).replace(/\s+/g, ' ');
    const base = file.endsWith('build.rs') ? dirname(file) : crateDir(file);
    for (const m of body.matchAll(INCLUDE)) {
      const raw = m[1] ?? '';
      const relativeTo = raw.startsWith('/') ? base : dirname(file);
      const resolved = normalize(posix.join(relativeTo, raw));
      if (resolved.startsWith('packages/')) found.push({ from: file, path: resolved });
    }
    if (file.endsWith('build.rs')) {
      for (const m of body.matchAll(BUILD_SCRIPT_PATH)) {
        const resolved = normalize(posix.join(base, m[1] ?? ''));
        if (resolved.startsWith('packages/')) found.push({ from: file, path: resolved });
      }
    }
  }
  return found;
}

/**
 * The `COPY` sources of the warm-up: what the builder stage has in place when
 * it compiles the workspace with a stub main. Read from that stage's `FROM`
 * to the `RUN` that writes the stub, so another stage's copies count for
 * nothing.
 */
export function warmUpCopies(dockerfile: string): string[] {
  const copies: string[] = [];
  let inBuilder = false;
  for (const line of dockerfile.split('\n')) {
    if (/^FROM\s.*\sAS\s+builder\b/i.test(line)) inBuilder = true;
    if (!inBuilder) continue;
    if (/^RUN .*fn main\(\)/.test(line)) break;
    const m = /^COPY\s+(\S+)\s+\S+/.exec(line);
    if (m?.[1]) copies.push(m[1].replace(/\/+$/, ''));
  }
  return copies;
}

/** The embeds no warm-up `COPY` puts in place. */
export function uncovered(all: Embed[], copies: string[]): Embed[] {
  const covered = (path: string) => copies.some((c) => path === c || path.startsWith(`${c}/`));
  return all.filter((e) => !covered(e.path));
}
