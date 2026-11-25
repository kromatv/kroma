import { type ModuleShape, PASCAL, type Reexport, shapeOf } from './module-shape.ts';

/** How the walk reaches the disk: a file's text, and the files a specifier
 *  written in `from` resolves to (every platform variant), or none. */
export interface DoorIo {
  read(file: string): string;
  resolve(specifier: string, from: string): string[];
}

/** One name a module gives: `target` is an identifier in scope at the end of
 *  the module, or a member of a namespace it declares (`PageHeader.Back`). */
export interface NamedTarget {
  target: string;
  name: string;
}

/** The names the doors give, by the absolute file that declares each one, and
 *  every file the walk read. */
export interface DoorWalk {
  names: Map<string, NamedTarget[]>;
  visited: Set<string>;
}

interface Origin {
  file: string;
  local: string;
}

class Walker {
  readonly shapes = new Map<string, ModuleShape>();

  private readonly exported = new Map<string, Map<string, Origin[]>>();

  private readonly io: DoorIo;

  constructor(io: DoorIo) {
    this.io = io;
  }

  shape(file: string): ModuleShape {
    const known = this.shapes.get(file);
    if (known) {
      return known;
    }
    const shape = shapeOf(this.io.read(file), file);
    this.shapes.set(file, shape);
    return shape;
  }

  exportsOf(file: string): Map<string, Origin[]> {
    const known = this.exported.get(file);
    if (known) {
      return known;
    }
    const out = new Map<string, Origin[]>();
    this.exported.set(file, out);
    const shape = this.shape(file);
    for (const source of shape.exportAll) {
      this.gather(out, source, file);
    }
    for (const [name, binding] of shape.exports) {
      out.set(
        name,
        'source' in binding ? this.follow(binding, file) : this.local(file, binding.local),
      );
    }
    return out;
  }

  private gather(out: Map<string, Origin[]>, source: string, from: string): void {
    for (const target of this.io.resolve(source, from)) {
      for (const [name, origins] of this.exportsOf(target)) {
        if (name !== 'default') {
          out.set(name, [...(out.get(name) ?? []), ...origins]);
        }
      }
    }
  }

  private local(file: string, local: string): Origin[] {
    const shape = this.shape(file);
    const imported = shape.imports.get(local);
    if (imported) {
      return this.follow(imported, file);
    }
    return shape.declared.has(local) ? [{ file, local }] : [];
  }

  private follow({ source, imported }: Reexport, from: string): Origin[] {
    return this.io
      .resolve(source, from)
      .flatMap((target) => this.exportsOf(target).get(imported) ?? []);
  }
}

function namesOf(walker: Walker, { file, local }: Origin, name: string): NamedTarget[] {
  const declared = walker.shape(file).declared.get(local);
  if (declared?.kind === 'function') {
    return [{ target: local, name }];
  }
  if (declared?.kind !== 'namespace') {
    return [];
  }
  return declared.parts.map((part) => ({
    target: part.value ?? `${local}.${part.key}`,
    name: `${name}.${part.key}`,
  }));
}

function add(names: Map<string, NamedTarget[]>, file: string, named: NamedTarget[]): void {
  const list = names.get(file) ?? [];
  for (const entry of named) {
    if (!list.some(({ target, name }) => target === entry.target && name === entry.name)) {
      list.push(entry);
    }
  }
  if (list.length > 0) {
    names.set(file, list);
  }
}

/** Walks the doors to the files that declare what they export, and names each
 *  PascalCase export that is function-like after the door, and each part of an
 *  exported namespace `Export.Key`. Nothing a door does not export is named. */
export function walkDoors(doors: readonly string[], io: DoorIo): DoorWalk {
  const walker = new Walker(io);
  const names = new Map<string, NamedTarget[]>();
  for (const door of doors) {
    for (const [name, origins] of walker.exportsOf(door)) {
      for (const origin of PASCAL.test(name) ? origins : []) {
        add(names, origin.file, namesOf(walker, origin, name));
      }
    }
  }
  return { names, visited: new Set(walker.shapes.keys()) };
}
