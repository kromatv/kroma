import { appendFileSync } from 'node:fs';

function appendTo(variable: string, line: string): boolean {
  const file = process.env[variable];
  if (!file) return false;
  appendFileSync(file, `${line}\n`);
  return true;
}

/** A step output: `$GITHUB_OUTPUT` under Actions, stdout on a laptop. */
export function setOutput(name: string, value: string | boolean | number): void {
  const line = `${name}=${value}`;
  if (!appendTo('GITHUB_OUTPUT', line)) console.log(line);
}

/** A block of Markdown on the run's summary page, or on stdout. */
export function summary(markdown: string): void {
  if (!appendTo('GITHUB_STEP_SUMMARY', markdown)) console.log(markdown);
}

export const notice = (message: string) => console.log(`::notice::${message}`);
export const warning = (message: string) => console.log(`::warning::${message}`);
