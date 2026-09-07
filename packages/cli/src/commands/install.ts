import { existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { openProject } from '../project';
import {
  bundleFor,
  bundleRunsOn,
  hostTriplePart,
  resolveServer,
  type ServerOptions,
  serverPlatform,
  uploadBundle,
} from '../server';

export interface InstallOptions extends ServerOptions {
  id?: string | undefined;
  file?: string | undefined;
  from?: string | undefined;
  cwd?: string;
}

function pickBundle(options: InstallOptions, cwd: string, triple: string): string {
  if (options.file) return options.file;
  const id =
    options.id ?? (existsSync(join(cwd, 'module.json')) ? openProject(cwd).manifest.id : undefined);
  if (!id)
    throw new Error('usage: kroma install [module-id] [--file x.kmod] [--server URL] [--token T]');
  const dir = options.from ?? join(cwd, 'dist', 'modules');
  const file = existsSync(dir) ? bundleFor(readdirSync(dir), id, triple) : undefined;
  if (!file) throw new Error(`no packed bundle for '${id}' in ${dir}; run \`kroma build\` first`);
  return join(dir, file);
}

/** `kroma install`: upload a packed `.kmod` to a running server. The upload
 *  path rather than a registry: a server refuses to install over http, and a
 *  local registry never is. */
export async function installCommand(options: InstallOptions): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const server = resolveServer(options);
  const platform = await serverPlatform(server);
  const path = pickBundle(options, cwd, platform?.target ?? hostTriplePart());
  if (!bundleRunsOn(basename(path), platform)) {
    throw new Error(
      `${basename(path)} was built for another platform; the server at ${server.url} runs ${platform?.target}. Build with --target ${platform?.target}.`,
    );
  }
  const body = await uploadBundle(server, path);
  console.log(`installed ${basename(path)} -> ${server.url}`);
  if (body.trim()) console.log(`  ${body.trim()}`);
  return 0;
}
