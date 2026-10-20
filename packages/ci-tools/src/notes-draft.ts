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

/**
 * A note made of the subjects alone, for when no model is reachable: every
 * feature under New and every fix under Fixed, in English in both files. It is
 * a starting point for a writer, never something to ship as it stands.
 */
export function fallbackNote(commits: readonly Commit[], lang: Lang): string {
  const [, newHeading, fixedHeading] = HEADINGS[lang];
  const lines = [
    ...section(newHeading, commits.filter((c) => c.type === 'feat').map(bullet)),
    ...section(fixedHeading, commits.filter(isFix).map(bullet)),
  ];
  return `${lines.join('\n').trimEnd()}\n`;
}

/** What a tester of a canary build should look at, from the subjects alone. */
export function fallbackCanary(commits: readonly Commit[]): string {
  const lines = commits.filter(releasable).map(bullet);
  return lines.length === 0 ? 'Maintenance only.\n' : `${lines.join('\n')}\n`;
}

/**
 * Why a drafted note cannot be used, or null when it can: the server parses
 * the `##` headings, so an unknown one or one out of order would drop a section.
 */
export function shapeProblem(note: string, lang: Lang): string | null {
  const allowed: readonly string[] = HEADINGS[lang];
  const found = note
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.trim());
  if (found.length === 0) return 'no section';
  const unknown = found.find((heading) => !allowed.includes(heading));
  if (unknown) return `unknown heading '${unknown}'`;
  const order = found.map((heading) => allowed.indexOf(heading));
  if (order.some((index, i) => i > 0 && index <= (order[i - 1] ?? -1)))
    return 'headings out of order';
  return null;
}

/** Whether any commit in the range is something a user could notice. */
export const hasReleasable = (commits: readonly Commit[]) => commits.some(releasable);
