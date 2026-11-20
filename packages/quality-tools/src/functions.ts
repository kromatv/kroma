import { z } from 'zod';
import { type LineSpan, rustTestSpans } from './rust-test-spans';

const Row = z.object({
  file: z.string(),
  name: z.string(),
  start: z.number().int(),
  end: z.number().int(),
  lines: z.number().int(),
  complexity: z.number().int(),
  crap: z.number().nullable(),
  parameters: z.number().int().optional(),
  nesting: z.number().int().optional(),
  tries: z.number().int().optional(),
});

/** One function as `python/functions.py` measured it. */
export type FunctionScore = z.infer<typeof Row>;

/** The functions `python/functions.py` printed, one JSON object per line. */
export function parseFunctions(output: string): FunctionScore[] {
  return output
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => Row.parse(JSON.parse(line)));
}

/** Functions grouped by the file that holds them. */
export function byFile(functions: readonly FunctionScore[]): Map<string, FunctionScore[]> {
  const grouped = new Map<string, FunctionScore[]>();
  for (const scored of functions) {
    const held = grouped.get(scored.file) ?? [];
    held.push(scored);
    grouped.set(scored.file, held);
  }
  return grouped;
}

/**
 * The functions that are production code: every one but a Rust function
 * inside a `#[cfg(test)]` item. `read` hands back a file's source.
 */
export function outsideRustTests(
  functions: readonly FunctionScore[],
  read: (file: string) => string,
): FunctionScore[] {
  const known = new Map<string, LineSpan[]>();
  const testsOf = (file: string) => {
    const spans = known.get(file) ?? (file.endsWith('.rs') ? rustTestSpans(read(file)) : []);
    known.set(file, spans);
    return spans;
  };
  return functions.filter(
    (scored) =>
      !testsOf(scored.file).some((span) => scored.start >= span.start && scored.end <= span.end),
  );
}
