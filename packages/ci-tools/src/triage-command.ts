import { parseArgs } from 'node:util';
import { $ } from 'bun';
import { z } from 'zod';
import { summary } from './actions';
import {
  type Axes,
  additions,
  areasOfForm,
  areasOfPaths,
  isTriaged,
  type Proposal,
  typeOfTitle,
} from './triage-labels';
import { classify, type LabelInfo } from './triage-model';

const USAGE = 'usage: bun run ci triage (--number <n>... | --open) [--dry-run]';

const Labels = z.array(z.object({ name: z.string(), description: z.string().nullish() }));
const Ticket = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.string(),
  labels: z.array(z.object({ name: z.string() })),
  user: z.object({ type: z.string() }),
  pull_request: z.unknown().optional(),
});
type Ticket = z.infer<typeof Ticket>;
const Numbers = z.array(z.coerce.number().int().positive());

const REPO = 'repos/{owner}/{repo}';

const lines = (out: string) => out.split('\n').filter(Boolean);

async function readLabels(): Promise<LabelInfo[]> {
  const raw = await $`gh label list --limit 500 --json name,description`.json();
  return Labels.parse(raw).map((l) => ({ name: l.name, description: l.description ?? '' }));
}

const axis = (labels: readonly LabelInfo[], prefix: string) =>
  labels.map((l) => l.name).filter((name) => name.startsWith(`${prefix}/`));

async function readTicket(number: number): Promise<Ticket> {
  const path = `${REPO}/issues/${number}`;
  return Ticket.parse(await $`gh api ${path}`.json());
}

async function changedPaths(number: number): Promise<string[]> {
  const path = `${REPO}/pulls/${number}/files`;
  return lines(await $`gh api --paginate ${path} --jq ${'.[].filename'}`.text());
}

async function openNumbers(): Promise<number[]> {
  const path = `${REPO}/issues?state=open&per_page=100`;
  return Numbers.parse(lines(await $`gh api --paginate ${path} --jq ${'.[].number'}`.text()));
}

async function addLabels(number: number, names: readonly string[]): Promise<void> {
  const path = `${REPO}/issues/${number}/labels`;
  const fields = names.flatMap((name) => ['-f', `labels[]=${name}`]);
  await $`gh api --method POST ${path} ${fields}`.quiet();
}

async function propose(
  ticket: Ticket,
  axes: Axes,
  labels: readonly LabelInfo[],
): Promise<{ proposal: Proposal; reason: string }> {
  if (ticket.pull_request !== undefined) {
    const proposal = {
      type: typeOfTitle(ticket.title),
      areas: areasOfPaths(await changedPaths(ticket.number)),
    };
    return { proposal, reason: 'from the title and the changed paths' };
  }
  const current = ticket.labels.map((l) => l.name);
  if (isTriaged(current)) return { proposal: { areas: [] }, reason: 'already triaged' };
  const body = ticket.body ?? '';
  const form = areasOfForm(body);
  const model = await classify(
    { number: ticket.number, title: ticket.title, body, labels: current },
    axes,
    labels,
  );
  if (!model) return { proposal: { areas: form }, reason: 'no model answered' };
  return { proposal: { ...model, areas: form.length ? form : model.areas }, reason: model.reason };
}

async function triage(
  number: number,
  axes: Axes,
  labels: readonly LabelInfo[],
  dryRun: boolean,
): Promise<string> {
  const ticket = await readTicket(number);
  if (ticket.state !== 'open') return `- #${number}: closed, skipped`;
  if (ticket.user.type === 'Bot') return `- #${number}: opened by a bot, skipped`;
  const current = ticket.labels.map((l) => l.name);
  const { proposal, reason } = await propose(ticket, axes, labels);
  const added = additions(current, proposal, axes);
  if (added.length && !dryRun) await addLabels(number, added);
  const verb = dryRun ? 'would add' : 'added';
  const outcome = added.length ? `${verb} ${added.join(', ')}` : 'nothing to add';
  return `- #${number}: ${outcome} (${reason})`;
}

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      number: { type: 'string', multiple: true },
      open: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const numbers = values.open ? await openNumbers() : Numbers.parse(values.number ?? []);
  if (!numbers.length) throw new Error(USAGE);
  const labels = await readLabels();
  const axes = {
    type: axis(labels, 'type'),
    priority: axis(labels, 'priority'),
    area: axis(labels, 'area'),
  };
  const report: string[] = [];
  for (const number of numbers) report.push(await triage(number, axes, labels, values['dry-run']));
  summary(['### Triage', '', ...report, ''].join('\n'));
}
