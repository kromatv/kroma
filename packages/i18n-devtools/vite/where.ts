import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';
import type { ViteDevServer } from 'vite';

/** A line in a file, as a person would read it. The file is the caller's own:
 *  a map names its sources however the transform that wrote it chose to. */
export interface Position {
  readonly line: number;
}

/** A position in a module the browser was served, as a stack trace reports it:
 *  one-based on both axes. */
export interface Served {
  readonly url: string;
  readonly line: number;
  readonly column: number;
}

const maps = new Map<string, TraceMap | null>();

// A transform reports `{ mappings: '' }` where it moved nothing, and Vite's own
// `SourceMap` is a wider shape than the tracer's input type in every shell that
// resolves its own copy of vite - so the shape is checked here and asserted
// once, rather than at each of them.
function traced(map: unknown): TraceMap | null {
  const raw = map as { mappings?: string } | null | undefined;
  if (!raw?.mappings) return null;
  return new TraceMap(raw as ConstructorParameters<typeof TraceMap>[0]);
}

/**
 * Where a served position was written.
 *
 * A stack trace names the module the browser was given, which is the module
 * after every transform this repo runs - React Compiler most of all, whose
 * memo caches move a line by a dozen either way. The map back is the dev
 * server's, so the answer is too: it is asked to transform the module rather
 * than for whatever it last happened to keep, which is a result it drops
 * whenever the module is invalidated.
 */
export async function sourceOf(at: Served, server: ViteDevServer): Promise<Position | null> {
  let map = maps.get(at.url);
  if (map === undefined) {
    const result = await server.environments.client.transformRequest(at.url).catch(() => null);
    map = traced(result?.map);
    maps.set(at.url, map);
  }
  if (!map) return null;
  const found = originalPositionFor(map, { line: at.line, column: Math.max(0, at.column - 1) });
  return found.line === null ? null : { line: found.line };
}

/** Forget every map: an edit anywhere retransforms, and a map read before it
 *  points at lines that have moved. */
export function forgetMaps(): void {
  maps.clear();
}
