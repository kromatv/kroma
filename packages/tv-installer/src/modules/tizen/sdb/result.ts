export type Verdict = 'success' | 'failure' | 'unknown';

export interface SdbResult {
  verdict: Verdict;
  code: number | null;
  output: string;
}

const APPCMD_EXIT = /appcmd_exitcode:\s*(-?\d+)/;
const PROCESSING = /processing result\s*:\s*([A-Z_]+)\s*\[\s*(-?\d+)\s*\]/i;
const SUCCESS =
  /(install completed|uninstall completed|successfully installed|succeeded|result:\s*launched|app_id is)/i;
const FAILURE =
  /(command not found|permission denied|no such file|not installed|installation failed|failed|failure|denied|error)/i;

/**
 * Reads a device's answer to an install, launch or uninstall. `unknown` means
 * the set said nothing this parser recognises, which is a reason to try the
 * next command shape rather than to report a failure.
 */
export function parseResult(output: string): SdbResult {
  const text = output.trim();

  const exit = APPCMD_EXIT.exec(text);
  if (exit?.[1]) {
    const code = Number(exit[1]);
    return { verdict: code === 0 ? 'success' : 'failure', code, output: text };
  }

  const processing = PROCESSING.exec(text);
  if (processing?.[1] && processing[2]) {
    const code = Number(processing[2]);
    const ok = /^(ok|success)/i.test(processing[1]) && code === 0;
    return { verdict: ok ? 'success' : 'failure', code, output: text };
  }

  if (SUCCESS.test(text)) return { verdict: 'success', code: 0, output: text };
  if (FAILURE.test(text)) return { verdict: 'failure', code: null, output: text };
  return { verdict: 'unknown', code: null, output: text };
}

export function describeResult(action: string, result: SdbResult): string {
  const tail = result.output.split('\n').filter(Boolean).slice(-3).join(' / ');
  const code = result.code === null ? '' : ` [${result.code}]`;
  const said = tail ? `: ${tail}` : '';
  return `${action} ${result.verdict}${code}${said}`;
}
