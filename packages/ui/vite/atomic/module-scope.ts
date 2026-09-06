// A module as a static reader sees it: its top-level constants, what it
// imports and from where, what it exports, and how an import lands on disk.
// What those bindings are worth is `evaluate.ts`.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseSync } from 'vite';

export interface Node {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

interface Program {
  body: Node[];
}

type ImportBinding = { source: string; imported: string };

type ExportBinding = { local: string } | ImportBinding;

/** A module's top-level bindings, as far as a static reader can see them. */
export interface ModuleScope {
  file: string;
  consts: Map<string, Node>;
  imports: Map<string, ImportBinding>;
  exports: Map<string, ExportBinding>;
  exportAll: string[];
}

/** Thrown for a value that cannot be known before the app runs; `reason` says
 *  what stopped it, for the build's report. */
export class Unstatic extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`not static: ${reason}`);
    this.reason = reason;
  }
}

const MAX_MODULE_CHAIN = 6;

const EXTENSIONS = ['.web.ts', '.web.tsx', '.ts', '.tsx', '/index.ts', '/index.tsx'];

const lang = (file: string) => (file.endsWith('.tsx') ? 'tsx' : 'ts');

/** Parses a module the way the browser build will read it. */
export function parseModule(code: string, file: string): Program {
  return parseSync(file, code, { lang: lang(file) }).program as unknown as Program;
}

/** The name an identifier or a string key spells. */
export function nameOf(node: Node): string {
  return node.type === 'Identifier' ? (node.name as string) : String(node.value);
}

function bindDeclaration(scope: ModuleScope, decl: Node, exported: boolean): void {
  if (decl.type !== 'VariableDeclaration' || decl.kind !== 'const') return;
  for (const declarator of decl.declarations as Node[]) {
    const id = declarator.id as Node;
    const init = declarator.init as Node | null;
    if (id.type !== 'Identifier' || !init) continue;
    scope.consts.set(id.name as string, init);
    if (exported) scope.exports.set(id.name as string, { local: id.name as string });
  }
}

function bindImport(scope: ModuleScope, stmt: Node): void {
  if (stmt.importKind === 'type') return;
  const source = (stmt.source as Node).value as string;
  for (const spec of stmt.specifiers as Node[]) {
    if (spec.importKind === 'type') continue;
    const local = (spec.local as Node).name as string;
    if (spec.type === 'ImportDefaultSpecifier')
      scope.imports.set(local, { source, imported: 'default' });
    if (spec.type === 'ImportSpecifier') {
      scope.imports.set(local, { source, imported: nameOf(spec.imported as Node) });
    }
  }
}

function bindExport(scope: ModuleScope, stmt: Node): void {
  if (stmt.exportKind === 'type') return;
  if (stmt.declaration) {
    bindDeclaration(scope, stmt.declaration as Node, true);
    return;
  }
  const source = stmt.source ? ((stmt.source as Node).value as string) : null;
  for (const spec of stmt.specifiers as Node[]) {
    if (spec.exportKind === 'type') continue;
    const local = nameOf(spec.local as Node);
    const exported = nameOf(spec.exported as Node);
    scope.exports.set(exported, source ? { source, imported: local } : { local });
  }
}

/** Reads the bindings a static evaluation may reach. */
export function scopeOf(program: Program, file: string): ModuleScope {
  const scope: ModuleScope = {
    file,
    consts: new Map(),
    imports: new Map(),
    exports: new Map(),
    exportAll: [],
  };
  for (const stmt of program.body) {
    if (stmt.type === 'VariableDeclaration') bindDeclaration(scope, stmt, false);
    else if (stmt.type === 'ImportDeclaration') bindImport(scope, stmt);
    else if (stmt.type === 'ExportNamedDeclaration') bindExport(scope, stmt);
    else if (stmt.type === 'ExportAllDeclaration' && stmt.exportKind !== 'type') {
      scope.exportAll.push((stmt.source as Node).value as string);
    }
  }
  return scope;
}

interface Roots {
  repoRoot: string;
}

function withExtension(base: string): string | null {
  if (/\.[cm]?[jt]sx?$/.test(base) && existsSync(base)) return base;
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const ALIASES: readonly (readonly [prefix: string, dir: string])[] = [
  ['#ui/', 'packages/ui/src/'],
  ['#tv/', 'packages/tv/src/'],
  ['#web/', 'clients/web/src/'],
  ['@kroma/ui/tokens/', 'packages/ui/src/core/tokens/'],
  ['@kroma/ui/kit/', 'packages/ui/src/components/'],
];

const EXACT: Readonly<Record<string, string>> = {
  '@kroma/ui/tokens': 'packages/ui/src/core/tokens/index.ts',
  '@kroma/ui/kit': 'packages/ui/src/kit.ts',
  '@kroma/ui': 'packages/ui/src/index.ts',
};

/** Where an import lands on disk, for the specifiers a workspace file may use
 *  to reach a constant; null for anything a static reader does not follow. */
export function resolveModule(specifier: string, from: string, { repoRoot }: Roots): string | null {
  if (specifier.startsWith('.')) return withExtension(resolve(dirname(from), specifier));
  const exact = EXACT[specifier];
  if (exact) return withExtension(join(repoRoot, exact));
  for (const [prefix, dir] of ALIASES) {
    if (specifier.startsWith(prefix)) {
      return withExtension(join(repoRoot, dir, specifier.slice(prefix.length)));
    }
  }
  return null;
}

/**
 * The workspace's modules as static scopes, read once each and again when the
 * file changes, so a dev server sees an edited constant.
 */
export class ModuleLoader {
  private readonly scopes = new Map<string, { mtime: number; scope: ModuleScope }>();

  private readonly roots: Roots;

  constructor(roots: Roots) {
    this.roots = roots;
  }

  resolve(specifier: string, from: string): string | null {
    return resolveModule(specifier, from, this.roots);
  }

  scope(file: string): ModuleScope {
    const mtime = statSync(file).mtimeMs;
    const hit = this.scopes.get(file);
    if (hit && hit.mtime === mtime) return hit.scope;
    const scope = scopeOf(parseModule(readFileSync(file, 'utf8'), file), file);
    this.scopes.set(file, { mtime, scope });
    return scope;
  }

  /** The initialiser of `name` as `file` exports it, following re-exports. */
  exportOf(file: string, name: string, chain: number): { init: Node; scope: ModuleScope } {
    if (chain > MAX_MODULE_CHAIN) throw new Unstatic(`re-export chain past ${file}`);
    const scope = this.scope(file);
    const binding = scope.exports.get(name);
    if (binding && 'local' in binding) {
      const init = scope.consts.get(binding.local);
      if (!init) throw new Unstatic(`${name} in ${file} is not a const`);
      return { init, scope };
    }
    if (binding) return this.follow(binding, scope, chain);
    for (const source of scope.exportAll) {
      try {
        return this.follow({ source, imported: name }, scope, chain);
      } catch (error) {
        if (!(error instanceof Unstatic)) throw error;
      }
    }
    throw new Unstatic(`${file} does not export ${name}`);
  }

  private follow(binding: ImportBinding, scope: ModuleScope, chain: number) {
    const target = this.resolve(binding.source, scope.file);
    if (!target) throw new Unstatic(`import from ${binding.source}`);
    return this.exportOf(target, binding.imported, chain + 1);
  }
}
