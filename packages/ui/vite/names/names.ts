import { type AppendResult, appendNames } from './append.ts';
import type { DoorWalk, NamedTarget } from './door-walk.ts';
import { walkKit } from './kit-doors.ts';

interface Graph {
  getModulesByFile(file: string): Set<unknown> | undefined;
  invalidateModule(mod: unknown): void;
}

type CacheKey = (context: { id: string }) => string;

/** Where the kit's sources live. */
export interface NamesOptions {
  repoRoot: string;
}

/** The plugin, typed as narrowly as Vite and Vitest call it. */
export interface NamesPlugin {
  name: string;
  enforce: 'pre';
  configureServer(server: { moduleGraph: Graph }): void;
  configureVitest(context: { defineCacheKeyGenerator: (key: CacheKey) => void }): void;
  buildStart(): void;
  watchChange(id: string): void;
  transform: {
    order: 'pre';
    handler(code: string, id: string): Pick<AppendResult, 'code' | 'map'> | null;
  };
  buildEnd(this: { info: (message: string) => void }): void;
}

const fileOf = (id: string) => id.split('?')[0] ?? id;

const same = (a: NamedTarget[] | undefined, b: NamedTarget[] | undefined) =>
  JSON.stringify(a) === JSON.stringify(b);

class KitNames {
  graph: Graph | null = null;

  appended = 0;

  private walked: DoorWalk | null = null;

  private readonly repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  get walk(): DoorWalk {
    this.walked ??= walkKit(this.repoRoot);
    return this.walked;
  }

  restart(): void {
    this.walked = walkKit(this.repoRoot);
    this.appended = 0;
  }

  changed(id: string): void {
    const before = this.walk;
    if (!before.visited.has(id)) {
      return;
    }
    this.walked = walkKit(this.repoRoot);
    const files = new Set([...before.names.keys(), ...this.walk.names.keys()]);
    for (const file of files) {
      if (!same(before.names.get(file), this.walk.names.get(file))) {
        this.drop(file);
      }
    }
  }

  append(code: string, id: string): AppendResult | null {
    const file = fileOf(id);
    const named = this.walk.names.get(file);
    if (!named) {
      return null;
    }
    this.appended += named.length;
    return appendNames(code, file, named);
  }

  private drop(file: string): void {
    for (const mod of this.graph?.getModulesByFile(file) ?? []) {
      this.graph?.invalidateModule(mod);
    }
  }
}

/**
 * Gives every component the kit's doors export its public name as `displayName`
 * and in the kit's registry (`#ui/lib/component-names`), by appending one call
 * per name to the module that declares it. The doors are walked when a build
 * starts, and again when a file the walk read changes; a dev server then drops
 * the modules whose names moved, so the next load names them. Vitest's module
 * cache is keyed on the names each module gets.
 */
export function kromaNames({ repoRoot }: NamesOptions): NamesPlugin {
  const kit = new KitNames(repoRoot);
  return {
    name: 'kroma-names',
    enforce: 'pre',
    configureServer: (server) => {
      kit.graph = server.moduleGraph;
    },
    configureVitest: ({ defineCacheKeyGenerator }) => {
      defineCacheKeyGenerator(
        ({ id }) => `kroma-names:${JSON.stringify(kit.walk.names.get(fileOf(id)) ?? [])}`,
      );
    },
    buildStart: () => kit.restart(),
    watchChange: (id) => kit.changed(id),
    transform: { order: 'pre', handler: (code, id) => kit.append(code, id) },
    buildEnd() {
      if (kit.appended > 0) {
        this.info(`[kroma-names] ${kit.appended} names appended to the modules this build loaded`);
      }
    },
  };
}
