const SLUG = /^[a-z][a-z0-9_]*$/;

interface NewStep {
  version: number;
  name: string;
  file: string;
  steps: string;
}

/** The version the core baseline stands for, read from `schema.rs`. */
export function baselineVersion(schemaRs: string): number {
  const match = /baseline_version:\s*(\d+)/.exec(schemaRs);
  if (!match) throw new Error('schema.rs names no baseline_version');
  return Number(match[1]);
}

/**
 * The next step after the ones `stepsRs` lists: its version, its file under
 * `steps/`, and `stepsRs` with the step appended.
 */
export function nextStep(stepsRs: string, baseline: number, slug: string): NewStep {
  if (!SLUG.test(slug)) throw new Error(`a step name is snake_case, got '${slug}'`);
  const listed = [...stepsRs.matchAll(/name:\s*"(\d{4})_/g)].length;
  const version = baseline + listed + 1;
  const name = `${String(version).padStart(4, '0')}_${slug}`;
  const file = `steps/${name}.sql`;
  const entry = [
    '    Step {',
    `        name: "${name}",`,
    `        run: Run::Sql(include_str!("${file}")),`,
    '        rebuilds: false,',
    '    },',
  ].join('\n');
  const appended = stepsRs.includes('= &[];')
    ? stepsRs.replace('= &[];', `= &[\n${entry}\n];`)
    : stepsRs.replace(/\n\];\s*$/, `\n${entry}\n];\n`);
  if (appended === stepsRs) throw new Error('steps.rs has no STEPS list to append to');
  const steps = appended.replace('use kroma_sqlite::Step;', 'use kroma_sqlite::{Run, Step};');
  return { version, name, file, steps };
}
