import type { ReaderClip } from './schemas';

/** A clipped text, where the sweep read it. */
export interface Clip {
  language: string;
  target: string;
  screen: string;
  text: string;
  clipped: ReaderClip;
}

/** A screen the sweep could not read, and why. */
export interface Unread {
  language: string;
  target: string;
  screen: string;
  reason: string;
}

/** A clipped text with the languages it is clipped in, how many times one
 *  screen shows it, and the catalog key it reads, `de:monitoring.followed`,
 *  or null for a text no catalog holds. */
export interface Finding {
  languages: string[];
  target: string;
  screen: string;
  text: string;
  key: string | null;
  clipped: ReaderClip;
  times: number;
}

/** A clip with the catalog key its text reads, or null. */
export type Keyed = Clip & { key: string | null };

const MAX_TEXT = 80;
const LANGUAGE_WIDTH = 9;
const TARGET_WIDTH = 6;

function grouped<T>(items: readonly T[], keyOf: (item: T) => string): [T, ...T[]][] {
  const groups = new Map<string, [T, ...T[]]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return [...groups.values()];
}

const placeOf = (clip: Keyed) =>
  JSON.stringify([clip.target, clip.screen, clip.text, clip.clipped.width, clip.clipped.height]);

function findingOf([first, ...rest]: readonly [Keyed, ...Keyed[]]): Finding {
  const { language, ...place } = first;
  const repeated = rest.filter((clip) => clip.language === language).length;
  const languages = [...new Set([language, ...rest.map((clip) => clip.language)])];
  return { ...place, languages, times: repeated + 1 };
}

/** The clips as findings: a text clipped the same way on the same screen is
 *  one finding, with every language it is clipped in and the times one
 *  language's screen shows it. */
export function collapse(clips: readonly Keyed[]): Finding[] {
  return grouped(clips, placeOf).map(findingOf);
}

function shown(text: string): string {
  const line = text.replaceAll(/\s+/g, ' ').trim();
  return line.length > MAX_TEXT ? `${line.slice(0, MAX_TEXT - 1)}…` : line;
}

/** How much of a text is cut, as a person reads it: `misses 8px across`. */
export function missText({ width, height }: ReaderClip): string {
  const parts = [width > 0 ? `${width}px across` : '', height > 0 ? `${height}px down` : ''];
  return `misses ${parts.filter(Boolean).join(' and ')}`;
}

function where(languages: string, target: string, screen: string): string {
  return `${languages.padEnd(LANGUAGE_WIDTH - 1)} ${target.padEnd(TARGET_WIDTH - 1)} ${screen}`;
}

/** One finding on one line: its languages, `all` when it is clipped in every
 *  one of `swept`, its target and screen, the text, its key, and how much of
 *  it is cut. */
export function findingLine(finding: Finding, swept: readonly string[]): string {
  const every = swept.length > 1 && finding.languages.length === swept.length;
  const languages = every ? 'all' : finding.languages.join(',');
  const key = finding.key === null ? '' : ` (${finding.key})`;
  const times = finding.times > 1 ? ` (x${finding.times})` : '';
  const head = where(languages, finding.target, finding.screen);
  return `${head}  "${shown(finding.text)}"${key}  ${missText(finding.clipped)}${times}`;
}

/** One screen the sweep could not read, on one line. */
export function unreadLine(unread: Unread): string {
  return `${where(unread.language, unread.target, unread.screen)}  not read: ${unread.reason}`;
}

/** The last line of a sweep: how many clipped texts, how many of them from
 *  the catalogs, and in which languages. */
export function summaryLine(findings: readonly Finding[], swept: readonly string[]): string {
  if (findings.length === 0) {
    return `No clipped text in ${swept.join(', ')}.`;
  }
  const catalog = findings.filter((finding) => finding.key !== null).length;
  const counts = swept
    .map((language) => [language, findings.filter((f) => f.languages.includes(language))] as const)
    .filter(([, found]) => found.length > 0)
    .map(([language, found]) => `${language} ${found.length}`);
  const noun = findings.length === 1 ? 'text' : 'texts';
  return `${findings.length} clipped ${noun}, ${catalog} from the catalogs: ${counts.join(', ')}.`;
}

function section(title: string, lines: readonly string[]): string[] {
  return lines.length === 0 ? [] : ['', title, ...lines];
}

/** The report a person reads: the texts of the catalogs first, then the rest
 *  (titles, names, what the server sent), then the screens not read, then
 *  the summary. */
export function reportLines(
  findings: readonly Finding[],
  unread: readonly Unread[],
  swept: readonly string[],
): string[] {
  const line = (finding: Finding) => findingLine(finding, swept);
  const catalog = findings.filter((finding) => finding.key !== null).map(line);
  const content = findings.filter((finding) => finding.key === null).map(line);
  return [
    ...section('From the catalogs:', catalog),
    ...section('Not from a catalog:', content),
    ...section('Not read:', unread.map(unreadLine)),
    '',
    summaryLine(findings, swept),
  ];
}
