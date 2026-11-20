import { rustTestSpans } from './rust-test-spans';

export interface FileFinding {
  file: string;
  lines: number;
  limit: number;
  inherited: boolean;
}

export const FILE_LINE_LIMIT = 300;

/**
 * The lines of a Rust file that hold production code: not blank, not a line
 * comment, and outside every `#[cfg(test)]` item.
 */
export function rustCodeLines(source: string): number {
  const tests = rustTestSpans(source);
  const inTest = (line: number) => tests.some((span) => line >= span.start && line <= span.end);
  return source.split('\n').filter((text, index) => {
    const trimmed = text.trim();
    return trimmed.length > 0 && !trimmed.startsWith('//') && !inTest(index + 1);
  }).length;
}

/**
 * A file over the limit, or nothing. It is inherited when the base version
 * was at least as long: a change answers for a file it takes past the limit
 * or makes longer. `before` is 0 for a file the change adds.
 */
export function judgeFileSize(file: string, now: number, before: number): FileFinding | undefined {
  if (now <= FILE_LINE_LIMIT) {
    return undefined;
  }
  return { file, lines: now, limit: FILE_LINE_LIMIT, inherited: now <= before };
}
