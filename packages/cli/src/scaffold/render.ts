import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

export type Vars = Readonly<Record<string, string>>;

/** Replaces every `__KEY__` in `text` with `vars[KEY]`; an unknown key is left
 *  as it is, so a template typo shows up in the output rather than vanishing. */
export function render(text: string, vars: Vars): string {
  return text.replace(/__([A-Z_]+)__/g, (all, key: string) => vars[key] ?? all);
}

/** `_gitignore` → `.gitignore`: npm drops dotfiles and `package.json` from a
 *  template tree, so those are spelled with a leading underscore. */
export function outputName(name: string): string {
  return name.startsWith('_') ? `.${name.slice(1)}` : name;
}

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name));
}

/** Copies one template tree into `target`, rendering names and contents. */
export function renderTree(templateDir: string, target: string, vars: Vars): string[] {
  const written: string[] = [];
  for (const file of files(templateDir)) {
    const rel = relative(templateDir, file)
      .split('/')
      .map((part) => outputName(render(part, vars)))
      .join('/');
    const out = join(target, rel);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, render(readFileSync(file, 'utf8'), vars));
    written.push(rel);
  }
  return written;
}
