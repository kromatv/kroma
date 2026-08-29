import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, delimiter, isAbsolute, join, relative, sep } from 'node:path';

/** An editor the machine running the dev server can open a file in. */
export interface Editor {
  readonly id: string;
  readonly name: string;
}

/** What the machine running the dev server looks like, so the search can be
 *  answered without one. */
export interface Where {
  readonly path: string | undefined;
  readonly platform: string;
  readonly pathExt?: string;
  readonly exists: (file: string) => boolean;
}

// Which editors exist, where each installs and what launches it is knowledge
// `launch-editor` already keeps for all three platforms and updates as editors
// ship. Reading its tables rather than writing one here is what keeps this from
// being a list that rots, in the package least likely to hear that an editor
// arrived.
const require_ = createRequire(import.meta.url);

function tableOf(file: string): Array<[string, string]> {
  return Object.entries(require_(`launch-editor/editor-info/${file}`) as Record<string, string>);
}

// A row is what the editor installs as, and the command that launches it. On
// macOS that is asked of two tables: its own is the applications, and an editor
// that lives on PATH - every terminal one - is in the other. Applications come
// first, because a bundle knows the name a person calls it by.
function table(platform: string): Array<[string, string]> {
  if (platform === 'win32') {
    const exes = require_('launch-editor/editor-info/windows.js') as string[];
    return exes.map((exe) => [exe, exe]);
  }
  const commands = tableOf('linux.js');
  return platform === 'darwin' ? [...tableOf('macos.js'), ...commands] : commands;
}

/** What `command` is called on a platform: Windows spells the extension out,
 *  and which extensions count is the operator's `PATHEXT`. */
export function commandNames(command: string, platform: string, pathExt?: string): string[] {
  if (platform !== 'win32' || /\.\w+$/.test(command)) return [command];
  return (pathExt ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .filter(Boolean)
    .map((ext) => command + ext.toLowerCase());
}

/** Whether any of `names` is in one of `dirs`. */
export function onPath(
  dirs: readonly string[],
  names: readonly string[],
  exists: (file: string) => boolean,
): boolean {
  return dirs.some((dir) => names.some((name) => exists(join(dir, name))));
}

/** Whether this machine can run `command`: a path it has, or a name on PATH.
 *  The only condition that matters, since an editor that cannot be run is one
 *  the panel should not offer. */
export function runnable(command: string, where: Where): boolean {
  if (isAbsolute(command)) return where.exists(command);
  const dirs = (where.path ?? '').split(delimiter).filter(Boolean);
  return onPath(dirs, commandNames(command, where.platform, where.pathExt), where.exists);
}

/** What an editor is called, read off where it installs: the application on
 *  macOS, the command everywhere else. */
export function nameOf(install: string): string {
  const app = install.split(sep).find((part) => part.endsWith('.app'));
  return app ? app.slice(0, -'.app'.length) : idOf(install);
}

/** The editor's own name for itself, which is what the panel holds on to: a
 *  command rather than a path, so nothing about this machine is written into a
 *  browser's session. */
export function idOf(command: string): string {
  return basename(command).replace(/\.\w+$/, '');
}

function machine(): Where {
  return {
    path: process.env.PATH,
    platform: process.platform,
    pathExt: process.env.PATHEXT,
    exists: existsSync,
  };
}

function found(where: Where): Map<string, Editor & { run: string }> {
  const editors = new Map<string, Editor & { run: string }>();
  for (const [install, command] of table(where.platform)) {
    const id = idOf(command);
    if (editors.has(id) || !runnable(command, where)) continue;
    editors.set(id, { id, name: nameOf(install), run: command });
  }
  return editors;
}

/** Every editor this machine can open a file in, named once each. */
export function installedEditors(where: Where = machine()): Editor[] {
  return [...found(where).values()]
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** What launches `id`, or `null` where this machine does not have it. The
 *  panel sends back what it was offered, and nothing else is ever run. */
export function launcherOf(id: string, where: Where = machine()): string | null {
  return found(where).get(id)?.run ?? null;
}

// A stack frame names a module by its URL. One served from outside the project
// root carries a filesystem path (Vite's `/@fs` prefix), and one inside it
// arrives root-relative - which starts with a slash and so cannot be told from
// an absolute path by its shape. What tells them apart is which one is there.
const POSITION = /:\d+(?::\d+)?$/;

/** Where `file` is on disk, given the root the dev server serves, or `null`
 *  where it is neither. Keeps the `:line:column` the caller asked for, which is
 *  how the editor is told where to put the cursor. */
export function resolveFile(
  file: string,
  root: string,
  exists: (path: string) => boolean = existsSync,
): string | null {
  const at = POSITION.exec(file);
  const path = at ? file.slice(0, at.index) : file;
  const position = at?.[0] ?? '';
  if (exists(path)) return path + position;
  const inRoot = join(root, path);
  return exists(inRoot) ? inRoot + position : null;
}

/** Whether `file` is one of the trees the dev server is allowed to read, which
 *  is the same boundary Vite serves modules within. A route that opens a file
 *  named over HTTP is a route that must not open every file on the disk. */
export function within(file: string, roots: readonly string[]): boolean {
  return roots.some((root) => {
    const step = relative(root, file);
    return step !== '' && !step.startsWith('..') && !isAbsolute(step);
  });
}
