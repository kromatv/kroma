import { existsSync, watch } from 'node:fs';
import { join, relative } from 'node:path';
import { packForDev } from '../bundle/pack';
import { buildSidecar, targetDir } from '../cargo';
import { buildFrontend } from '../fe/build';
import { openProject, type Project } from '../project';
import {
  bundleRunsOn,
  hostTriplePart,
  resolveServer,
  type Server,
  type ServerOptions,
  serverPlatform,
  uploadBundle,
} from '../server';
import { style } from '../style';
import { feOutDir } from './build';

export interface DevOptions extends ServerOptions {
  dir?: string;
  target?: string;
  cwd?: string;
}

const DEBOUNCE_MS = 120;

type Part = 'server' | 'ui' | 'bundle';

export function partOf(project: Project, file: string): Part | null {
  const rel = relative(project.dir, file);
  if (rel.startsWith('..') || rel.startsWith('dist') || rel.startsWith('.bundle')) return null;
  if (rel.startsWith('server/'))
    return rel.endsWith('.rs') || rel.endsWith('Cargo.toml') ? 'server' : null;
  if (rel.startsWith('ui/'))
    return rel.includes('/dist/') || rel.includes('node_modules') ? null : 'ui';
  if (rel.startsWith('locales/') || rel === 'module.json') return 'ui';
  if (rel.startsWith('icon.')) return 'bundle';
  return null;
}

class Loop {
  private binPath: string | null = null;
  private hasFe = false;
  private running: Promise<void> | null = null;
  private readonly pending = new Set<Part>();

  constructor(
    private readonly project: Project,
    private readonly server: Server,
    private readonly dir: string,
    private readonly target: string | null,
  ) {}

  request(parts: Iterable<Part>): void {
    for (const p of parts) this.pending.add(p);
    if (this.running) return;
    this.running = this.drain().finally(() => {
      this.running = null;
      if (this.pending.size > 0) this.request([]);
    });
  }

  private async drain(): Promise<void> {
    const parts = new Set(this.pending);
    this.pending.clear();
    const started = Date.now();
    try {
      if (parts.has('server')) {
        this.binPath = await buildSidecar(this.project, this.dir, {
          target: this.target,
          profile: 'dev',
        });
      }
      if (parts.has('ui')) {
        this.hasFe = await buildFrontend(this.project, feOutDir(this.project), 'development');
      }
      const packed = packForDev({
        project: this.project,
        binPath: this.binPath,
        feDir: this.hasFe ? feOutDir(this.project) : null,
        outDir: join(this.project.dir, 'dist', 'dev'),
        target: this.target,
      });
      await uploadBundle(this.server, packed.path);
      console.log(`  ${style.green('installed')} ${packed.file} in ${Date.now() - started}ms`);
    } catch (e) {
      console.error(`  ${style.red('failed')}: ${e instanceof Error ? e.message : String(e)}`);
      console.error('  the running module is left as it was');
    }
  }
}

/** `kroma dev`: build the module once and install it on the server, then
 *  rebuild and reinstall the half that changed on every save. Upload rather
 *  than copy, so the server can be this machine or the NAS. */
export async function devCommand(options: DevOptions): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const project = openProject(options.dir ? join(cwd, options.dir) : cwd);
  const server = resolveServer(options);
  const platform = await serverPlatform(server);
  const target = options.target?.trim() || null;
  const host = hostTriplePart();
  if (platform && !target && !platform.target.startsWith(host)) {
    throw new Error(
      `${server.url} runs ${platform.target} and this machine builds ${host}; pass --target ${platform.target}`,
    );
  }
  if (platform && target && !bundleRunsOn(`x-${target}.kmod`, platform)) {
    throw new Error(`${server.url} runs ${platform.target}, not ${target}`);
  }

  const dir = targetDir(cwd, [project]);
  const loop = new Loop(project, server, dir, target);
  console.log(`${style.bold(project.manifest.id)} -> ${server.url}`);
  loop.request(['server', 'ui']);

  const timers = new Map<Part, ReturnType<typeof setTimeout>>();
  const roots = [
    'server/src',
    'server/Cargo.toml',
    'ui/src',
    'locales',
    'module.json',
    'icon.svg',
    'icon.png',
  ]
    .map((r) => join(project.dir, r))
    .filter((r) => existsSync(r));
  for (const root of roots) {
    watch(root, { recursive: true }, (_event, file) => {
      const part = partOf(project, join(root, file ?? ''));
      if (!part) return;
      clearTimeout(timers.get(part));
      timers.set(
        part,
        setTimeout(() => {
          console.log(`\n${relative(project.dir, join(root, file ?? ''))} changed`);
          loop.request([part]);
        }, DEBOUNCE_MS),
      );
    });
  }
  console.log(`watching ${roots.map((r) => relative(project.dir, r)).join(', ')}\n`);
  await new Promise<never>(() => {});
  return 0;
}
