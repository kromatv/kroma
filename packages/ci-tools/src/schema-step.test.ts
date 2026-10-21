import { describe, expect, it } from 'vitest';
import { baselineVersion, nextStep } from './schema-step';

const EMPTY = 'use kroma_sqlite::Step;\n\npub(super) const STEPS: &[Step] = &[];\n';

describe('nextStep', () => {
  it('numbers the first step after the baseline and imports Run for it', () => {
    const step = nextStep(EMPTY, 1, 'users_theme');

    expect(step.name).toBe('0002_users_theme');
    expect(step.file).toBe('steps/0002_users_theme.sql');
    expect(step.steps).toContain('use kroma_sqlite::{Run, Step};');
    expect(step.steps).toContain('run: Run::Sql(include_str!("steps/0002_users_theme.sql")),');
  });

  it('appends after the steps already listed', () => {
    const first = nextStep(EMPTY, 1, 'users_theme');

    const second = nextStep(first.steps, 1, 'drop_legacy_tokens');

    expect(second.version).toBe(3);
    expect(second.steps.indexOf('0002_users_theme')).toBeLessThan(
      second.steps.indexOf('0003_drop_legacy_tokens'),
    );
    expect(second.steps.trimEnd().endsWith('];')).toBe(true);
  });

  it('refuses a name that is not snake_case', () => {
    expect(() => nextStep(EMPTY, 1, 'Users-Theme')).toThrow(/snake_case/);
  });
});

describe('baselineVersion', () => {
  it('reads the version the baseline stands for', () => {
    expect(baselineVersion('    baseline_version: 7,\n')).toBe(7);
  });
});
