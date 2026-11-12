import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { bundleName } from '../bundle/pack';
import { openProject } from '../project';
import { resolveServer, type ServerOptions, uploadBundle } from '../server';

export interface InstallOptions extends ServerOptions {
  id?: string;
  file?: string;
  from?: string;
  cwd?: string;
}

function pickBundle(options: InstallOptions, cwd: string): string {
  if (options.file) return options.file;
  const id =
    options.id ?? (existsSync(join(cwd, 'module.json')) ? openProject(cwd).manifest.id : undefined);
  if (!id)
    throw new Error('usage: kroma install [module-id] [--file x.kmod] [--server URL] [--token T]');
  const dir = options.from ?? join(cwd, 'dist', 'modules');
  const path = join(dir, bundleName(id));
  if (!existsSync(path)) {
    throw new Error(`no packed bundle for '${id}' in ${dir}; run \`kroma build\` first`);
  }
  return path;
}

/** `kroma install`: upload a packed `.kmod` to a running server. The upload
 *  path rather than a registry: a server refuses to install over http, and a
 *  local registry never is. */
export async function installCommand(options: InstallOptions): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const server = resolveServer(options);
  const path = pickBundle(options, cwd);
  const body = await uploadBundle(server, path);
  console.log(`installed ${basename(path)} -> ${server.url}`);
  if (body.trim()) console.log(`  ${body.trim()}`);
  return 0;
}
