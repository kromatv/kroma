import { sep } from 'node:path';
import { sourceRoots } from '../../bundler/index.ts';
import { ModuleLoader } from './module-scope.ts';
import { RuleSheet } from './sheet.ts';
import { type Skip, transformModule } from './transform.ts';
import { resolveAsBrowser } from './web-theme.ts';

const SOURCE = /\.tsx?$/;

const NOT_SHIPPED = /\.(test|spec)\.tsx?$/;

const TOKENS_MARKER = '--kroma-bg:';

interface BundleAsset {
  type: string;
  fileName: string;
  source?: unknown;
}

interface ResolvedConfig {
  command: 'serve' | 'build';
}

interface PluginContext {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  environment?: { config?: { consumer?: string } };
}

export interface AtomicPlugin {
  name: string;
  enforce: 'pre';
  configResolved(config: ResolvedConfig): void;
  buildStart(): void;
  transform(this: PluginContext, code: string, id: string): { code: string; map: unknown } | null;
  generateBundle: {
    order: 'post';
    handler(this: PluginContext, options: unknown, bundle: Record<string, BundleAsset>): void;
  };
  buildEnd(this: PluginContext): void;
}

export interface AtomicOptions {
  repoRoot: string;
}

// A minified sheet arrives as bytes, an unminified one as text.
function textOf(source: unknown): string | null {
  if (typeof source === 'string') return source;
  if (source instanceof Uint8Array) return new TextDecoder().decode(source);
  return null;
}

const summary = (compiled: number, skipped: readonly Skip[]) =>
  `[kroma-atomic] ${compiled} declarations compiled ahead of time, ${skipped.length} left to the runtime`;

/**
 * Compiles the kit's static style declarations ahead of time. In a build the
 * rules land in the token stylesheet the shell already loads; on the dev
 * server each module injects its own as it loads. Set `KROMA_ATOMIC_REPORT=1`
 * to see every declaration left to the runtime and why.
 */
export function kromaAtomic({ repoRoot }: AtomicOptions): AtomicPlugin {
  const roots = sourceRoots(repoRoot).map((root) => `${root}${sep}`);
  const loader = new ModuleLoader({ repoRoot });
  const sheet = new RuleSheet();
  const skipped: (Skip & { file: string })[] = [];
  let compiled = 0;
  let command: 'serve' | 'build' = 'build';
  const report = process.env.KROMA_ATOMIC_REPORT === '1';
  const isSource = (file: string) =>
    SOURCE.test(file) &&
    !NOT_SHIPPED.test(file) &&
    !file.includes(`${sep}node_modules${sep}`) &&
    roots.some((root) => file.startsWith(root));
  return {
    name: 'kroma-atomic',
    enforce: 'pre',
    configResolved(config) {
      command = config.command;
      resolveAsBrowser();
    },
    // Per environment: a server build counts its own modules, not the client's.
    buildStart() {
      compiled = 0;
      skipped.length = 0;
    },
    transform(code, id) {
      const [file = ''] = id.split('?');
      if (!isSource(file)) return null;
      const out = transformModule({ code, file, loader, inject: command === 'serve' });
      if (!out) return null;
      sheet.add(out.rules);
      compiled += out.compiled;
      for (const skip of out.skipped) {
        skipped.push({ ...skip, file });
        if (report)
          this.info?.(`[kroma-atomic] ${file}:${skip.line} left to the runtime: ${skip.reason}`);
      }
      return out.code === null ? null : { code: out.code, map: out.map };
    },
    // After Vite's own CSS plugin: a bundle that keeps its CSS in one file
    // only emits it from that plugin's post-ordered hook, so an earlier look
    // finds no stylesheet at all.
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        if (sheet.size === 0) return;
        const css = sheet.toCss();
        let landed = false;
        for (const file of Object.values(bundle)) {
          if (file.type !== 'asset' || !file.fileName.endsWith('.css')) continue;
          const source = textOf(file.source);
          if (!source?.includes(TOKENS_MARKER)) continue;
          file.source = `${source}\n${css}\n`;
          landed = true;
        }
        // A server bundle owns no stylesheet; the client's carries the rules.
        if (!landed && this.environment?.config?.consumer !== 'server') {
          this.warn?.(
            `[kroma-atomic] ${sheet.size} compiled rules found no token stylesheet to land in: this bundle loads neither virtual:kroma*.css nor @kroma/ui/css, so its compiled styles paint nothing`,
          );
        }
      },
    },
    buildEnd() {
      if (command === 'build') this.info?.(summary(compiled, skipped));
    },
  };
}
