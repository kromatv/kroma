import type { Commit } from './commits';

/** The headings a release note may carry, in order, per language. */
export const HEADINGS = {
  en: ['## Action required', '## New', '## Fixed', '## For the server owner'],
  fr: ['## À faire', '## Nouveautés', '## Corrections', '## Pour le propriétaire du serveur'],
} as const;

export type Lang = keyof typeof HEADINGS;

const isFix = (c: Commit) => c.type === 'fix' || c.type === 'perf';
const releasable = (c: Commit) => c.type === 'feat' || isFix(c);

function section(heading: string, lines: string[]): string[] {
  return lines.length === 0 ? [] : [heading, '', ...lines, ''];
}

const bullet = (c: Commit) => {
  const pr = c.pr ? ` (#${c.pr})` : '';
  return `- ${c.text}${pr}`;
};

function highlight(c: Commit): string[] {
  return [`### ${c.text}`, '', c.pr ? `#${c.pr}` : c.sha.slice(0, 9), ''];
}

/**
 * A note made of the subjects alone, for when no model is reachable: every
 * feature as a highlight under New and every fix under Fixed, in English in
 * both files. It is a starting point for a writer, never something to ship as
 * it stands.
 */
export function fallbackNote(commits: readonly Commit[], lang: Lang): string {
  const [, newHeading, fixedHeading] = HEADINGS[lang];
  const features = commits.filter((c) => c.type === 'feat').flatMap(highlight);
  const lines = [
    ...(features.length === 0 ? [] : [newHeading, '', ...features]),
    ...section(fixedHeading, commits.filter(isFix).map(bullet)),
  ];
  return `${lines.join('\n').trimEnd()}\n`;
}

/** What a tester of a canary build should look at, from the subjects alone. */
export function fallbackCanary(commits: readonly Commit[]): string {
  const lines = commits.filter(releasable).map(bullet);
  return lines.length === 0 ? 'Maintenance only.\n' : `${lines.join('\n')}\n`;
}

function looseUnderNew(lines: readonly string[], newHeading: string): boolean {
  const start = lines.indexOf(newHeading);
  if (start === -1) return false;
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) return false;
    if (line.startsWith('### ')) return false;
    if (line !== '') return true;
  }
  return false;
}

/**
 * Why a drafted note cannot be used, or null when it can. The server parses
 * the `##` headings, so an unknown one or one out of order would drop a
 * section, and it reads New only as `###` highlights, so text under New before
 * the first one would be lost.
 */
export function shapeProblem(note: string, lang: Lang): string | null {
  const allowed: readonly string[] = HEADINGS[lang];
  const lines = note.split('\n').map((line) => line.trim());
  const found = lines.filter((line) => line.startsWith('## '));
  if (found.length === 0) return 'no section';
  const unknown = found.find((heading) => !allowed.includes(heading));
  if (unknown) return `unknown heading '${unknown}'`;
  const order = found.map((heading) => allowed.indexOf(heading));
  if (order.some((index, i) => i > 0 && index <= (order[i - 1] ?? -1)))
    return 'headings out of order';
  if (looseUnderNew(lines, HEADINGS[lang][1])) return 'text under New outside a highlight';
  return null;
}

/** Whether any commit in the range is something a user could notice. */
export const hasReleasable = (commits: readonly Commit[]) => commits.some(releasable);
