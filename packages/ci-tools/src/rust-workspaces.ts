import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './root';

export interface Workspace {
  id: string;
  dir: string;
  targetDir: string | undefined;
}

const KMOD_TARGET_DIR = join(root, 'target/kmod');

// `--all-features` is no answer: the ML backends behind the whisper and vector
// modules' features are a build of their own, and the point of a default build
// is that it is cheap.
const EXTRA_FEATURES: Record<string, string> = { 'tv.kroma.torrents': 'rqbit' };

export const SERVER: Workspace = { id: 'server', dir: join(root, 'server'), targetDir: undefined };

export function workspaces(): Workspace[] {
  const modules = join(root, 'modules');
  const out = [SERVER];
  for (const entry of readdirSync(modules, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = entry.name === 'lib' ? join(modules, 'lib') : join(modules, entry.name, 'server');
    if (existsSync(join(dir, 'Cargo.toml'))) {
      out.push({ id: entry.name, dir, targetDir: KMOD_TARGET_DIR });
    }
  }
  return out;
}

export const featured = (): Workspace[] => workspaces().filter((ws) => ws.id in EXTRA_FEATURES);

export const on = (ws: Workspace): string[] => {
  const features = EXTRA_FEATURES[ws.id];
  return features ? ['--features', features] : [];
};
