import type { Commit } from './commits';

const REPO_URL = 'https://github.com/kromatv/kroma';

const SECTIONS = [
  { title: 'Breaking changes', takes: (c: Commit) => c.breaking },
  { title: 'Features', takes: (c: Commit) => !c.breaking && c.type === 'feat' },
  { title: 'Fixes', takes: (c: Commit) => !c.breaking && (c.type === 'fix' || c.type === 'perf') },
];

function line(commit: Commit): string {
  const scope = commit.scope ? `**${commit.scope}:** ` : '';
  const link = commit.pr
    ? `([#${commit.pr}](${REPO_URL}/pull/${commit.pr}))`
    : `(${commit.sha.slice(0, 9)})`;
  return `- ${scope}${commit.text} ${link}`;
}

/** One release's section of `CHANGELOG.md`: breaking changes, features and fixes, each sorted by scope. */
export function renderSection(version: string, date: string, commits: readonly Commit[]): string {
  const out = [`## ${version} (${date})`];
  for (const section of SECTIONS) {
    const picked = commits
      .filter(section.takes)
      .sort((a, b) => (a.scope ?? '').localeCompare(b.scope ?? ''));
    if (picked.length === 0) continue;
    out.push('', `### ${section.title}`, '', ...picked.map(line));
  }
  if (out.length === 1) out.push('', 'Maintenance only.');
  return out.join('\n');
}

const HEADER = '# Changelog\n';

/** `CHANGELOG.md` with `section` placed above every older release. */
export function prependSection(changelog: string, section: string): string {
  const rest = changelog.startsWith(HEADER)
    ? changelog.slice(HEADER.length).trimStart()
    : changelog;
  const older = rest ? '\n' + rest : '';
  return `${HEADER}\n${section}\n${older}`;
}
