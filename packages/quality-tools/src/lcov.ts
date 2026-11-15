interface FileRecord {
  lines: Map<number, number>;
  branches: Map<string, Branch>;
}

interface Branch {
  line: number;
  block: string;
  branch: string;
  taken: number;
}

type Records = Map<string, FileRecord>;

function relativeTo(root: string, path: string): string {
  const prefix = root.endsWith('/') ? root : `${root}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function recordFor(records: Records, file: string): FileRecord {
  const known = records.get(file);
  if (known !== undefined) {
    return known;
  }
  const created: FileRecord = { lines: new Map(), branches: new Map() };
  records.set(file, created);
  return created;
}

function addLine(record: FileRecord, body: string): void {
  const [line, hits] = body.split(',').map(Number);
  if (line === undefined || hits === undefined || Number.isNaN(line) || Number.isNaN(hits)) {
    return;
  }
  record.lines.set(line, Math.max(record.lines.get(line) ?? 0, hits));
}

function parseBranch(body: string): Branch | undefined {
  const [first, block, ...rest] = body.split(',');
  const taken = rest.pop();
  if (block === undefined || taken === undefined || rest.length === 0) {
    return undefined;
  }
  const line = Number(first);
  const hits = taken === '-' ? 0 : Number(taken);
  if (Number.isNaN(line) || Number.isNaN(hits)) {
    return undefined;
  }
  return { line, block, branch: rest.join(','), taken: hits };
}

function addBranch(record: FileRecord, body: string): void {
  const read = parseBranch(body);
  if (read === undefined) {
    return;
  }
  const key = `${read.line},${read.block},${read.branch}`;
  const taken = Math.max(record.branches.get(key)?.taken ?? 0, read.taken);
  record.branches.set(key, { ...read, taken });
}

function readReport(records: Records, text: string, root: string): void {
  let current: FileRecord | undefined;
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (line.startsWith('SF:')) {
      current = recordFor(records, relativeTo(root, line.slice(3)));
    } else if (line === 'end_of_record') {
      current = undefined;
    } else if (current !== undefined && line.startsWith('DA:')) {
      addLine(current, line.slice(3));
    } else if (current !== undefined && line.startsWith('BRDA:')) {
      addBranch(current, line.slice(5));
    }
  }
}

const byBranch = (a: Branch, b: Branch) =>
  a.line - b.line || a.block.localeCompare(b.block) || a.branch.localeCompare(b.branch);

function renderRecord(file: string, record: FileRecord): string {
  const branches = [...record.branches.values()]
    .sort(byBranch)
    .map((b) => `BRDA:${b.line},${b.block},${b.branch},${b.taken}`);
  const lines = [...record.lines.entries()]
    .sort(([a], [b]) => a - b)
    .map(([line, hits]) => `DA:${line},${hits}`);
  return ['TN:', `SF:${file}`, ...branches, ...lines, 'end_of_record'].join('\n');
}

/**
 * Several lcov reports as one, a file's records folded into a single record
 * that keeps the best hit count of each line and branch. Paths under `root`
 * become relative to it. Only what crapper reads survives: `DA` and `BRDA`.
 */
export function mergeLcov(reports: readonly string[], root: string): string {
  const records: Records = new Map();
  for (const report of reports) {
    readReport(records, report, root);
  }
  const files = [...records.keys()].sort((a, b) => a.localeCompare(b));
  return files.map((file) => `${renderRecord(file, recordFor(records, file))}\n`).join('');
}

/** The files a report holds a record for, as the report spells them. */
export function lcovFiles(report: string): Set<string> {
  const files = new Set<string>();
  for (const line of report.split('\n')) {
    if (line.startsWith('SF:')) {
      files.add(line.slice(3).trimEnd());
    }
  }
  return files;
}
