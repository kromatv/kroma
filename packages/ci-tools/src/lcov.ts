interface FileCoverage {
  lines: Map<number, number>;
  branches: Map<string, number | null>;
  functions: Map<string, { line: string; hits: number }>;
}

const empty = (): FileCoverage => ({ lines: new Map(), branches: new Map(), functions: new Map() });

function addTaken(seen: number | null | undefined, taken: number | null): number | null {
  if (seen === null || seen === undefined) {
    return taken;
  }
  return taken === null ? seen : seen + taken;
}

const READERS: Record<string, (file: FileCoverage, fields: string[]) => void> = {
  DA: (file, [at = '', hits = '']) => {
    const line = Number(at);
    file.lines.set(line, (file.lines.get(line) ?? 0) + Number(hits));
  },
  BRDA: (file, fields) => {
    const key = fields.slice(0, 3).join(',');
    const taken = fields[3] === '-' ? null : Number(fields[3]);
    file.branches.set(key, addTaken(file.branches.get(key), taken));
  },
  FN: (file, [line = '', ...name]) => {
    const key = name.join(',');
    file.functions.set(key, { line, hits: file.functions.get(key)?.hits ?? 0 });
  },
  FNDA: (file, [hits = '', ...name]) => {
    const key = name.join(',');
    const known = file.functions.get(key) ?? { line: '', hits: 0 };
    file.functions.set(key, { line: known.line, hits: known.hits + Number(hits) });
  },
};

function readLine(file: FileCoverage, line: string): void {
  const colon = line.indexOf(':');
  const reader = colon > 0 ? READERS[line.slice(0, colon)] : undefined;
  reader?.(file, line.slice(colon + 1).split(','));
}

function read(reports: readonly string[]): Map<string, FileCoverage> {
  const files = new Map<string, FileCoverage>();
  for (const report of reports) {
    let current: FileCoverage | undefined;
    for (const line of report.split('\n')) {
      if (line.startsWith('SF:')) {
        current = files.get(line.slice(3)) ?? empty();
        files.set(line.slice(3), current);
      } else if (line === 'end_of_record') {
        current = undefined;
      } else if (current !== undefined) {
        readLine(current, line);
      }
    }
  }
  return files;
}

const hit = (count: number | null) => (count ?? 0) > 0;

function write(path: string, file: FileCoverage): string[] {
  const functions = [...file.functions].filter(([, fn]) => fn.line !== '');
  const lines = [...file.lines].sort(([a], [b]) => a - b);
  const branches = [...file.branches].sort(([a], [b]) =>
    a.localeCompare(b, 'en', { numeric: true }),
  );
  return [
    `SF:${path}`,
    ...functions.map(([name, fn]) => `FN:${fn.line},${name}`),
    ...functions.map(([name, fn]) => `FNDA:${fn.hits},${name}`),
    `FNF:${functions.length}`,
    `FNH:${functions.filter(([, fn]) => hit(fn.hits)).length}`,
    ...branches.map(([key, taken]) => `BRDA:${key},${taken ?? '-'}`),
    `BRF:${branches.length}`,
    `BRH:${branches.filter(([, taken]) => hit(taken)).length}`,
    ...lines.map(([at, hits]) => `DA:${at},${hits}`),
    `LF:${lines.length}`,
    `LH:${lines.filter(([, hits]) => hit(hits)).length}`,
    'end_of_record',
  ];
}

/**
 * One lcov report from several. A source file two reports measured appears
 * once, with the hits of both added line by line, branch by branch and
 * function by function.
 */
export function mergeLcov(reports: readonly string[]): string {
  const files = [...read(reports)].sort(([a], [b]) => a.localeCompare(b));
  return `${files.flatMap(([path, file]) => write(path, file)).join('\n')}\n`;
}
