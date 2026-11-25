import { type ESTree, parseSync } from 'vite';

/** Where a binding comes from when another module declares it. */
export interface Reexport {
  source: string;
  imported: string;
}

/** One key of a namespace object, and the identifier it holds if it holds one. */
export interface Part {
  key: string;
  value: string | null;
}

/** What a top-level binding is, as far as naming goes. */
export type Declared =
  | { kind: 'function' }
  | { kind: 'namespace'; parts: Part[] }
  | { kind: 'other' };

/** A module's runtime exports, imports and top-level declarations. */
export interface ModuleShape {
  exports: Map<string, { local: string } | Reexport>;
  exportAll: string[];
  imports: Map<string, Reexport>;
  declared: Map<string, Declared>;
}

type Statement = ESTree.Program['body'][number];

/** PascalCase with at least one lowercase letter, so `Dialog` and not `KROMA`. */
export const PASCAL = /^[A-Z](?=[A-Za-z0-9]*[a-z])[A-Za-z0-9]*$/;

const OTHER: Declared = { kind: 'other' };

const FUNCTION_LIKE = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'CallExpression']);

const nameOf = (node: ESTree.ModuleExportName) =>
  node.type === 'Literal' ? node.value : node.name;

function partOf(property: ESTree.ObjectProperty | ESTree.SpreadElement): Part | null {
  if (property.type !== 'Property' || property.computed || property.method) {
    return null;
  }
  const { key, value, kind } = property;
  if (kind !== 'init' || key.type !== 'Identifier' || !PASCAL.test(key.name)) {
    return null;
  }
  return { key: key.name, value: value.type === 'Identifier' ? value.name : null };
}

function declaredOf(init: ESTree.Expression): Declared {
  if (FUNCTION_LIKE.has(init.type)) {
    return { kind: 'function' };
  }
  if (init.type !== 'ObjectExpression' || init.properties.length === 0) {
    return OTHER;
  }
  const parts = init.properties.map(partOf);
  return parts.every((part) => part !== null) ? { kind: 'namespace', parts } : OTHER;
}

function declare(shape: ModuleShape, decl: ESTree.Declaration): string[] {
  if (decl.type === 'FunctionDeclaration' && decl.id) {
    shape.declared.set(decl.id.name, { kind: 'function' });
    return [decl.id.name];
  }
  if (decl.type !== 'VariableDeclaration') {
    return [];
  }
  return decl.declarations.flatMap(({ id, init }) => {
    if (id.type !== 'Identifier') {
      return [];
    }
    const kind = decl.kind === 'const' && init ? declaredOf(init) : OTHER;
    shape.declared.set(id.name, kind);
    return [id.name];
  });
}

function bindImport(shape: ModuleShape, stmt: ESTree.ImportDeclaration): void {
  if (stmt.importKind === 'type') {
    return;
  }
  for (const spec of stmt.specifiers) {
    if (spec.type === 'ImportSpecifier' && spec.importKind !== 'type') {
      shape.imports.set(spec.local.name, {
        source: stmt.source.value,
        imported: nameOf(spec.imported),
      });
    }
    if (spec.type === 'ImportDefaultSpecifier') {
      shape.imports.set(spec.local.name, { source: stmt.source.value, imported: 'default' });
    }
  }
}

function bindExport(shape: ModuleShape, stmt: ESTree.ExportNamedDeclaration): void {
  if (stmt.exportKind === 'type') {
    return;
  }
  for (const name of stmt.declaration ? declare(shape, stmt.declaration) : []) {
    shape.exports.set(name, { local: name });
  }
  const source = stmt.source?.value;
  for (const spec of stmt.specifiers) {
    if (spec.exportKind === 'type') {
      continue;
    }
    const local = nameOf(spec.local);
    shape.exports.set(nameOf(spec.exported), source ? { source, imported: local } : { local });
  }
}

function bind(shape: ModuleShape, stmt: Statement): void {
  if (stmt.type === 'ExportNamedDeclaration') {
    bindExport(shape, stmt);
  } else if (stmt.type === 'ExportAllDeclaration' && stmt.exportKind !== 'type' && !stmt.exported) {
    shape.exportAll.push(stmt.source.value);
  } else if (stmt.type === 'ImportDeclaration') {
    bindImport(shape, stmt);
  } else if (stmt.type === 'VariableDeclaration' || stmt.type === 'FunctionDeclaration') {
    declare(shape, stmt);
  }
}

const lang = (file: string) => (file.endsWith('.tsx') ? 'tsx' : 'ts');

/** Reads the shape of one module; a module that does not parse has none. */
export function shapeOf(code: string, file: string): ModuleShape {
  const shape: ModuleShape = {
    exports: new Map(),
    exportAll: [],
    imports: new Map(),
    declared: new Map(),
  };
  const { program, errors } = parseSync(file, code, { lang: lang(file) });
  if (errors.length === 0) {
    for (const stmt of program.body) {
      bind(shape, stmt);
    }
  }
  return shape;
}
