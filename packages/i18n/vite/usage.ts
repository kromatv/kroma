import { noted, type Usage } from './scan.ts';

interface Chunk {
  readonly type: string;
  readonly isEntry?: boolean;
  readonly imports?: readonly string[];
  readonly moduleIds?: readonly string[];
}

/** One chunk's reading of one catalog file. */
export interface FileUsage {
  readonly named: number;
  readonly of: number;
  readonly whole: boolean;
  readonly keys: string[];
  /** The modules of the chunk that name the file, and how many keys each. */
  readonly from: Record<string, number>;
}

export type ChunkUsage = Record<string, { entry: boolean; files: Record<string, FileUsage> }>;

/** What a build fetches before its first screen: the catalog files its entry
 *  chunks and everything they import statically announce. */
export interface BootUsage {
  readonly chunks: string[];
  /** Messages fetched, over every file. */
  readonly messages: number;
  /** Messages of those the boot code names itself. */
  readonly named: number;
  readonly files: Record<string, BootFile>;
}

export interface BootFile {
  readonly named: number;
  readonly of: number;
  readonly whole: boolean;
  /** The static imports from an entry down to the module naming most of the
   *  file, dependencies left out: why the file is fetched this early. */
  readonly via: string[];
}

/** The static import graph of a build, as the bundler knows it. */
export interface ImportGraph {
  importers(id: string): readonly string[];
  isEntry(id: string): boolean;
  /** How a module is written in the report, where its id is an absolute path. */
  label?(id: string): string;
}

const DEPENDENCY = /[\\/]node_modules[\\/]/;

/** The shortest chain of static imports from an entry down to `id`, with the
 *  dependencies and the bundler's own modules left out. */
export function importChain(id: string, graph: ImportGraph): string[] {
  const below = new Map<string, string | null>([[id, null]]);
  const queue = [id];
  for (let at = queue.shift(); at !== undefined; at = queue.shift()) {
    if (graph.isEntry(at)) {
      const chain: string[] = [];
      for (let step: string | null | undefined = at; step; step = below.get(step)) chain.push(step);
      return chain.filter((step) => !DEPENDENCY.test(step) && !step.startsWith('\0'));
    }
    for (const importer of graph.importers(at)) {
      if (below.has(importer)) continue;
      below.set(importer, at);
      queue.push(importer);
    }
  }
  return [];
}

export interface BuildUsage {
  readonly boot: BootUsage;
  readonly chunks: ChunkUsage;
}

function chunkUsage(
  chunk: Chunk,
  byModule: ReadonlyMap<string, Usage>,
  keys: ReadonlyMap<string, readonly string[]>,
): Record<string, FileUsage> {
  const merged: Usage = new Map();
  const from = new Map<string, Record<string, number>>();
  for (const id of chunk.moduleIds ?? []) {
    for (const [file, own] of byModule.get(id) ?? []) {
      const into = noted(merged, file);
      for (const key of own.keys) into.keys.add(key);
      into.whole ||= own.whole;
      from.set(file, { ...from.get(file), [id]: own.keys.size });
    }
  }
  const files: Record<string, FileUsage> = {};
  for (const [file, own] of [...merged].sort(([a], [b]) => (a < b ? -1 : 1))) {
    files[file] = {
      named: own.keys.size,
      of: keys.get(file)?.length ?? 0,
      whole: own.whole,
      keys: [...own.keys].sort((a, b) => (a < b ? -1 : 1)),
      from: from.get(file) ?? {},
    };
  }
  return files;
}

function bootChunks(bundle: Readonly<Record<string, Chunk>>): string[] {
  const seen = new Set<string>();
  const queue = Object.keys(bundle).filter((name) => bundle[name]?.isEntry === true);
  for (let name = queue.pop(); name !== undefined; name = queue.pop()) {
    if (seen.has(name)) continue;
    seen.add(name);
    queue.push(...(bundle[name]?.imports ?? []));
  }
  return [...seen].sort((a, b) => (a < b ? -1 : 1));
}

function bootUsage(chunks: ChunkUsage, loaded: readonly string[], graph?: ImportGraph): BootUsage {
  const named = new Map<string, Set<string>>();
  const from = new Map<string, Record<string, number>>();
  const files: Record<string, BootFile> = {};
  for (const name of loaded) {
    for (const [file, own] of Object.entries(chunks[name]?.files ?? {})) {
      const keys = named.get(file) ?? new Set();
      for (const key of own.keys) keys.add(key);
      named.set(file, keys);
      from.set(file, { ...from.get(file), ...own.from });
      files[file] = {
        named: keys.size,
        of: own.of,
        whole: own.whole || files[file]?.whole === true,
        via: [],
      };
    }
  }
  for (const [file, own] of Object.entries(files)) {
    const [reader] = Object.entries(from.get(file) ?? {}).sort(([, a], [, b]) => b - a);
    if (graph && reader) files[file] = { ...own, via: importChain(reader[0], graph) };
  }
  const total = (pick: (file: BootFile) => number) =>
    Object.values(files).reduce((sum, file) => sum + pick(file), 0);
  return {
    chunks: loaded.filter((name) => name in chunks),
    messages: total((file) => file.of),
    named: total((file) => file.named),
    files,
  };
}

function labelled({ boot, chunks }: BuildUsage, label: (id: string) => string): BuildUsage {
  const renamed = <T>(record: Record<string, T>, each: (value: T) => T) =>
    Object.fromEntries(Object.entries(record).map(([key, value]) => [key, each(value)]));
  return {
    boot: {
      ...boot,
      files: renamed(boot.files, (file) => ({ ...file, via: file.via.map(label) })),
    },
    chunks: renamed(chunks, (chunk) => ({
      ...chunk,
      files: renamed(chunk.files, (file) => ({
        ...file,
        from: Object.fromEntries(Object.entries(file.from).map(([id, n]) => [label(id), n])),
      })),
    })),
  };
}

/** What each chunk of a build names of each catalog file, from what each of
 *  its modules names, and what that adds up to before the first screen. */
export function usageByChunk(
  bundle: Readonly<Record<string, Chunk>>,
  byModule: ReadonlyMap<string, Usage>,
  keys: ReadonlyMap<string, readonly string[]>,
  graph?: ImportGraph,
): BuildUsage {
  const chunks: ChunkUsage = {};
  for (const [name, chunk] of Object.entries(bundle)) {
    if (chunk.type !== 'chunk') continue;
    const files = chunkUsage(chunk, byModule, keys);
    if (Object.keys(files).length > 0) chunks[name] = { entry: chunk.isEntry === true, files };
  }
  const built = { boot: bootUsage(chunks, bootChunks(bundle), graph), chunks };
  return graph?.label ? labelled(built, graph.label) : built;
}

/** What to say of a build that fetches more than `limit` messages before its
 *  first screen, the heaviest file first with the imports that led to it, or
 *  null when it holds. */
export function overBoot({ messages, files }: BootUsage, limit: number): string | null {
  if (messages <= limit) return null;
  const lines = Object.entries(files)
    .sort(([, a], [, b]) => b.of - a.of)
    .map(([file, { named, of, via }]) => {
      const through = via.length > 0 ? `, through ${via.slice(-3).join(' > ')}` : '';
      return `  ${file}: ${named} of ${of} named${through}`;
    });
  return [
    `Messages fetched before the first screen: ${messages}. This build allows ${limit}.`,
    ...lines,
  ].join('\n');
}

/** The report file: one build per environment, by its name. */
export function renderUsage(builds: Readonly<Record<string, BuildUsage>>): string {
  return `${JSON.stringify(builds, null, 2)}\n`;
}
