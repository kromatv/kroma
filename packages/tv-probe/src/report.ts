import type { Check } from './check';

const COMPLAINTS_SHOWN = 8;
const COMPLAINT_CHARS = 150;
const NAME_WIDTH = 24;

interface Run {
  origin: string;
  destination: string;
  presses: number;
  items: number;
  throttle: number;
  verdicts: readonly Check[];
  complaints: readonly string[];
}

function tally(complaints: readonly string[]): Array<[string, number]> {
  const seen = new Map<string, number>();
  for (const complaint of complaints) {
    const line = complaint.replace(/\s+/g, ' ').slice(0, COMPLAINT_CHARS);
    seen.set(line, (seen.get(line) ?? 0) + 1);
  }
  return [...seen].slice(0, COMPLAINTS_SHOWN);
}

export function report(run: Run): string[] {
  return [
    `\n  ${run.origin}   ${run.destination}   ${run.presses} presses   ${run.items} items   CPU /${run.throttle}\n`,
    ...run.verdicts.map(
      ({ name, reads, ok }) => `  ${ok ? ' ok ' : 'FAIL'}  ${name.padEnd(NAME_WIDTH)} ${reads}`,
    ),
    ...tally(run.complaints).map(([complaint, count]) => `\n        ${count} x  ${complaint}`),
    '',
  ];
}
