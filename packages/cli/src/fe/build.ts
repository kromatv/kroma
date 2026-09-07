import { join } from 'node:path';
import { REMOTE_ENTRY, REMOTE_STYLES } from '@kroma/module-sdk/shared';
import { build } from 'vite';
import type { Project } from '../project';
import { kromaRemote } from './remote-plugin';

export type Mode = 'production' | 'development';

/** Builds a module's frontend into `outDir` as `remoteEntry.js` + chunks (+
 *  `style.css`), or does nothing for a module without one. */
export async function buildFrontend(
  project: Project,
  outDir: string,
  mode: Mode,
): Promise<boolean> {
  const ui = project.ui;
  if (!ui) return false;
  await build({
    configFile: false,
    envDir: false,
    root: ui.dir,
    mode,
    logLevel: 'warn',
    clearScreen: false,
    define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
    plugins: kromaRemote({
      entry: ui.entry,
      manifestPath: join(project.dir, 'module.json'),
      localesDir: join(project.dir, 'locales'),
    }),
    build: {
      outDir,
      emptyOutDir: true,
      target: 'es2022',
      minify: mode === 'production',
      sourcemap: mode === 'development',
      cssCodeSplit: false,
      lib: {
        entry: ui.entry,
        formats: ['es'],
        fileName: () => REMOTE_ENTRY,
        cssFileName: REMOTE_STYLES.replace(/\.css$/, ''),
      },
      rolldownOptions: {
        output: {
          chunkFileNames: '[name]-[hash].js',
          assetFileNames: '[name]-[hash][extname]',
        },
      },
    },
  });
  return true;
}
