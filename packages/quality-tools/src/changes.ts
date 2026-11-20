export interface LineRange {
  start: number;
  end: number;
}

export interface ChangedFile {
  file: string;
  added: boolean;
  lines: LineRange[];
}

const TARGET = /^\+\+\+ (?:b\/(.+)|\/dev\/null)$/;
const HUNK = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/;
const WHOLE_FILE: LineRange = { start: 1, end: Number.MAX_SAFE_INTEGER };

function hunkRange(line: string): LineRange | undefined {
  const match = HUNK.exec(line);
  if (match === null) {
    return undefined;
  }
  const start = Number(match[1]);
  const count = match[2] === undefined ? 1 : Number(match[2]);
  return count === 0 ? undefined : { start, end: start + count - 1 };
}

/**
 * The files a `git diff -U0` adds or modifies, each with the lines it adds or
 * rewrites. A hunk that only deletes names no line: nothing is left there to
 * judge.
 */
export function parseDiff(diff: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  let added = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('--- ')) {
      added = line === '--- /dev/null';
      continue;
    }
    const target = TARGET.exec(line)?.[1];
    if (target !== undefined) {
      files.push({ file: target, added, lines: [] });
      continue;
    }
    const range = hunkRange(line);
    if (range !== undefined) {
      files.at(-1)?.lines.push(range);
    }
  }
  return files;
}

/** A file git does not track yet, as a change that adds every line of it. */
export const addedFile = (file: string): ChangedFile => ({
  file,
  added: true,
  lines: [WHOLE_FILE],
});

/** Whether a change adds or rewrites a line inside the span. */
export function touches(change: ChangedFile, span: LineRange): boolean {
  return change.lines.some((range) => range.start <= span.end && range.end >= span.start);
}
