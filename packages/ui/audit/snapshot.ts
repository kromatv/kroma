import type { Measured } from './views';

/** The stories in a measurement run, each with its views in order. */
function byStory(measured: readonly Measured[]): ReadonlyMap<string, readonly Measured[]> {
  const out = new Map<string, Measured[]>();
  for (const entry of measured) {
    const list = out.get(entry.id) ?? [];
    list.push(entry);
    out.set(entry.id, list);
  }
  return out;
}

// The committed shape of both baselines: the story names the file, then one
// section per view, so a diff points at the view that moved.
function sections(
  entries: readonly Measured[],
  linesOf: (entry: Measured) => readonly string[],
): string {
  const head = `# ${entries[0]?.name ?? ''}  ${entries[0]?.file ?? ''}\n`;
  const body = entries
    .map((entry) => `\n## ${entry.view}\n${linesOf(entry).join('\n')}\n`)
    .join('');
  return `${head}${body}`;
}

/** One story's accessible tree, as it is committed. */
function accessText(entries: readonly Measured[]): string {
  return sections(entries, (entry) => entry.access.lines);
}

/** One story's paint snapshot, as it is committed. */
function paintText(entries: readonly Measured[]): string {
  return sections(entries, (entry) => entry.signature);
}

/** The first places two snapshots disagree, named so the reader sees which leaf
 * changed rather than that something did. */
function paintDrift(id: string, want: string, got: string, limit = 6): readonly string[] {
  if (want === got) return [];
  const a = want.split('\n');
  const b = got.split('\n');
  const out: string[] = [];
  for (let i = 0; i < Math.max(a.length, b.length) && out.length < limit; i += 1) {
    if (a[i] === b[i]) continue;
    out.push(
      `${id} line ${i + 1}`,
      `  was  ${a[i] ?? '(end of file)'}`,
      `  now  ${b[i] ?? '(end of file)'}`,
    );
  }
  return out;
}

export { accessText, byStory, paintDrift, paintText };
