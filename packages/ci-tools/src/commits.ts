const SUBJECT =
  /^(?<type>[a-z]+)(?:\((?<scope>[^()]+)\))?(?<bang>!)?: (?<text>.+?)(?: \(#(?<pr>\d+)\))?$/;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE: /m;

export interface Commit {
  sha: string;
  type: string;
  scope: string | null;
  text: string;
  pr: number | null;
  breaking: boolean;
}

/** A conventional commit read from its subject and body, or null for a subject that is not one. */
export function parseCommit(sha: string, subject: string, body = ''): Commit | null {
  const groups = SUBJECT.exec(subject.trim())?.groups;
  if (!groups?.type || !groups.text) return null;
  return {
    sha,
    type: groups.type,
    scope: groups.scope ?? null,
    text: groups.text,
    pr: groups.pr ? Number(groups.pr) : null,
    breaking: groups.bang === '!' || BREAKING_FOOTER.test(body),
  };
}
