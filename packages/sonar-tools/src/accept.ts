import { parseArgs } from 'node:util';
import { z } from 'zod';

const API = 'https://sonarcloud.io/api';
const TRANSITION = 'accept';
const PROJECT = 'maxscharwath_kroma';
const PAGE_SIZE = 100;

const Issues = z.object({
  issues: z.array(
    z.object({ key: z.string(), component: z.string(), line: z.number().optional() }),
  ),
});

type Issue = z.infer<typeof Issues>['issues'][number];

function authorization(token: string): string {
  const encoded = Buffer.from(`${token}:`).toString('base64');
  return `Basic ${encoded}`;
}

async function open(rule: string, branch: string, token: string): Promise<Issue[]> {
  const query = new URLSearchParams({
    componentKeys: PROJECT,
    branch,
    rules: rule,
    resolved: 'false',
    ps: String(PAGE_SIZE),
  });
  const response = await fetch(`${API}/issues/search?${query}`, {
    headers: { Authorization: authorization(token) },
  });
  if (!response.ok) throw new Error(`issues/search answered ${response.status}`);
  return Issues.parse(await response.json()).issues;
}

async function accept(issue: Issue, reason: string, token: string): Promise<boolean> {
  const post = (path: string, body: Record<string, string>) =>
    fetch(`${API}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: authorization(token),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body),
    });

  const commented = await post('issues/add_comment', { issue: issue.key, text: reason });
  const moved = await post('issues/do_transition', { issue: issue.key, transition: TRANSITION });
  if (commented.ok && moved.ok) return true;

  console.error(`${issue.key}: comment ${commented.status}, transition ${moved.status}`);
  return false;
}

/**
 * Accepts every open issue of one rule, with one reason. The rule is the unit
 * because the reason is: an issue is accepted for what the rule misunderstands
 * about this codebase, never for where it happens to have landed.
 */
export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      rule: { type: 'string' },
      reason: { type: 'string' },
      branch: { type: 'string', default: 'main' },
    },
  });
  const token = process.env.SONAR_TOKEN;
  if (!token) throw new Error('SONAR_TOKEN is not set: make one at sonarcloud.io/account/security');
  if (!values.rule || !values.reason) {
    throw new Error('usage: bun run sonar accept --rule <rule> --reason <why> [--branch <branch>]');
  }

  const issues = await open(values.rule, values.branch, token);
  const done = await Promise.all(issues.map((issue) => accept(issue, values.reason ?? '', token)));
  for (const issue of issues) {
    console.log(`  ${issue.component.split(':').at(-1)}:${issue.line ?? ''}`);
  }
  console.log(`accepted ${done.filter(Boolean).length} of ${issues.length} for ${values.rule}`);
  if (done.some((ok) => !ok)) process.exit(1);
}

if (import.meta.main) await main(process.argv.slice(2));
