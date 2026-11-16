import { tokensIn } from '@kromatv/i18n';

/** Something wrong with a translation. An error keeps it out of a pull request; a warning does not. */
export interface Issue {
  level: 'error' | 'warning';
  code: 'unknown-token' | 'missing-token' | 'unknown-ref' | 'too-long' | 'control-character';
  detail?: string;
}

/**
 * What a translation is checked against: the `source` text it renders, the
 * `keys` a `$t()` reference may quote, and whether it is a `plural` form,
 * which may spell `{count}` out instead.
 */
export interface Against {
  source: string;
  keys: ReadonlySet<string>;
  plural: boolean;
}

/** The longest message Lingua accepts, in UTF-16 code units. */
export const MAX_MESSAGE = 4000;

const REF = /\$t\(\s*([\w.-]+)\s*\)/g;

function hasControl(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if ((code < 0x20 && code !== 0x09 && code !== 0x0a) || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function shapeIssues(value: string): Issue[] {
  const issues: Issue[] = [];
  if (value.length > MAX_MESSAGE) {
    issues.push({ level: 'error', code: 'too-long' });
  }
  if (hasControl(value)) {
    issues.push({ level: 'error', code: 'control-character' });
  }
  return issues;
}

function tokenIssues(value: string, against: Against): Issue[] {
  const expected = new Set(tokensIn(against.source));
  const given = new Set(tokensIn(value));
  const relaxed = (token: string) => against.plural && token === 'count';
  return [
    ...[...given]
      .filter((token) => !expected.has(token) && !relaxed(token))
      .map((detail): Issue => ({ level: 'error', code: 'unknown-token', detail })),
    ...[...expected]
      .filter((token) => !given.has(token) && !relaxed(token))
      .map((detail): Issue => ({ level: 'warning', code: 'missing-token', detail })),
  ];
}

function refIssues(value: string, keys: ReadonlySet<string>): Issue[] {
  return [...value.matchAll(REF)]
    .flatMap(([, key]) => (key ? [key] : []))
    .filter((key) => !keys.has(key))
    .map((detail): Issue => ({ level: 'error', code: 'unknown-ref', detail }));
}

/** What is wrong with `value` as a translation, judged `against` its source. */
export function check(value: string, against: Against): Issue[] {
  return [...shapeIssues(value), ...tokenIssues(value, against), ...refIssues(value, against.keys)];
}

/** Whether any of `issues` keeps a translation out of a pull request. */
export function blocks(issues: readonly Issue[]): boolean {
  return issues.some((issue) => issue.level === 'error');
}
