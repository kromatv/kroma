import { spanLabel } from './dry';
import type { FileFinding } from './file-size';
import type { DuplicateFinding } from './gate';
import type { Finding, Measure } from './limits';

export interface GateResult {
  base: string;
  files: number;
  limits: Finding[];
  fileSizes: FileFinding[];
  duplicates: DuplicateFinding[];
  unscored: string[];
}

const FIX: Record<Measure, string> = {
  crap: 'test it or split it',
  complexity: 'return early, name the branches',
  lines: 'extract a named function',
  parameters: 'one struct with named fields',
  nesting: 'extract a function',
};

const number = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

const limitLine = ({ function: scored, measure, value, limit }: Finding) =>
  `- \`${scored.file}:${scored.start}\` \`${scored.name}\`: ${measure} ${number(value)}, limit ${limit} (${FIX[measure]})`;

const fileLine = ({ file, lines, limit }: FileFinding) =>
  `- \`${file}\`: ${lines} lines of code, limit ${limit} (split at a seam)`;

const duplicateLine = ({ pair }: DuplicateFinding) =>
  `- ${pair.score.toFixed(2)} \`${spanLabel(pair.left)}\` and \`${spanLabel(pair.right)}\` (extract the shared code)`;

type Kept = (finding: { inherited: boolean }) => boolean;

const added: Kept = (finding) => !finding.inherited;
const inherited: Kept = (finding) => finding.inherited;

function listed(result: GateResult, kept: Kept): string[] {
  return [
    ...result.limits.filter(kept).map(limitLine),
    ...result.fileSizes.filter(kept).map(fileLine),
    ...result.duplicates.filter(kept).map(duplicateLine),
  ];
}

/** How many findings fail the gate: the ones the change added or made worse. */
export const failures = (result: GateResult) => listed(result, added).length;

function section(title: string, body: readonly string[]): string[] {
  return body.length === 0 ? [] : ['', title, '', ...body];
}

/** The gate's verdict as markdown: what fails, then what the change touched and left over a limit. */
export function renderGate(result: GateResult): string {
  const failed = listed(result, added);
  const verdict =
    failed.length === 0
      ? `Passed: ${result.files} changed source file(s) against \`${result.base}\`.`
      : `Failed: ${failed.length} finding(s) in ${result.files} changed source file(s) against \`${result.base}\`.`;
  return [
    '## Quality gate',
    '',
    verdict,
    ...section('### Added or made worse by this change', failed),
    ...section('### Touched, and still over a limit from before', listed(result, inherited)),
    ...section(
      '### No coverage report holds these files, so their CRAP is not judged',
      result.unscored.map((file) => `- \`${file}\``),
    ),
    '',
  ].join('\n');
}
