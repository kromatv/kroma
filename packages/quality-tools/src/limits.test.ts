import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FILE_LINE_LIMIT } from './file-size';
import { type FunctionScore, judge, LIMITS } from './limits';
import { root } from './root';

const Max = z.tuple([z.string(), z.object({ max: z.number() })]);
const Lint = z.object({
  rules: z.object({
    'max-lines-per-function': Max,
    'max-params': Max,
    complexity: Max,
    'max-depth': Max,
    'max-lines': Max,
  }),
});

const score = (over: Partial<FunctionScore> = {}): FunctionScore => ({
  file: 'server/src/a.rs',
  name: 'walk',
  start: 1,
  end: 20,
  lines: 20,
  complexity: 4,
  crap: 4,
  parameters: 2,
  nesting: 1,
  ...over,
});

const measures = (findings: ReturnType<typeof judge>) =>
  findings.map((finding) => `${finding.measure}:${finding.inherited ? 'inherited' : 'new'}`);

describe('judge', () => {
  it('finds nothing in a function inside every limit', () => {
    expect(judge('rust', score(), [])).toEqual([]);
  });

  it('fails a new Rust function on each limit it is over', () => {
    const big = score({ lines: 31, complexity: 9, crap: 10, parameters: 4, nesting: 4 });

    expect(measures(judge('rust', big, []))).toEqual([
      'crap:new',
      'complexity:new',
      'lines:new',
      'parameters:new',
      'nesting:new',
    ]);
  });

  it('passes a value that is exactly the limit, except CRAP, which has to stay below it', () => {
    const edge = score({ lines: 30, complexity: 8, crap: 9.99, parameters: 3, nesting: 3 });

    expect(judge('rust', edge, [])).toEqual([]);
  });

  it('judges a TypeScript function on CRAP alone, since the lint holds its sizes', () => {
    const big = score({ lines: 80, complexity: 20, crap: 40, parameters: 6, nesting: 5 });

    expect(measures(judge('typescript', big, []))).toEqual(['crap:new']);
  });

  it('calls a finding inherited when the base function was already that large', () => {
    const before = score({ lines: 60 });

    expect(measures(judge('rust', score({ lines: 60 }), [before]))).toEqual(['lines:inherited']);
    expect(measures(judge('rust', score({ lines: 55 }), [before]))).toEqual(['lines:inherited']);
  });

  it('fails an older function the change makes longer', () => {
    const before = score({ lines: 60 });

    expect(measures(judge('rust', score({ lines: 61 }), [before]))).toEqual(['lines:new']);
  });

  it('reads CRAP as grown when the complexity grew, since the base has no coverage', () => {
    const before = score({ complexity: 12, crap: null });

    const same = judge('typescript', score({ complexity: 12, crap: 50 }), [before]);
    const worse = judge('typescript', score({ complexity: 13, crap: 60 }), [before]);

    expect(measures(same)).toEqual(['crap:inherited']);
    expect(measures(worse)).toEqual(['crap:new']);
  });

  it('compares against the largest of several base functions of the same name', () => {
    const before = [score({ lines: 40 }), score({ lines: 70 })];

    expect(measures(judge('rust', score({ lines: 65 }), before))).toEqual(['lines:inherited']);
  });

  it('does not count a Rust `?` as a decision, in the limit and in what grew', () => {
    const propagating = score({ complexity: 14, tries: 8 });
    const before = score({ complexity: 12, tries: 0 });

    expect(judge('rust', propagating, [])).toEqual([]);
    expect(measures(judge('rust', score({ complexity: 14, tries: 3 }), [before]))).toEqual([
      'complexity:inherited',
    ]);
  });

  it('does not judge CRAP where no coverage scored the function', () => {
    expect(judge('typescript', score({ crap: null, complexity: 30 }), [])).toEqual([]);
  });
});

describe('LIMITS', () => {
  it('holds for Rust the numbers the lint holds for TypeScript', () => {
    const { rules } = Lint.parse(JSON.parse(readFileSync(join(root, '.oxlintrc.json'), 'utf8')));

    expect({
      lines: rules['max-lines-per-function'][1].max,
      parameters: rules['max-params'][1].max,
      complexity: rules.complexity[1].max,
      nesting: rules['max-depth'][1].max,
      file: rules['max-lines'][1].max,
    }).toEqual({
      lines: LIMITS.lines,
      parameters: LIMITS.parameters,
      complexity: LIMITS.complexity,
      nesting: LIMITS.nesting,
      file: FILE_LINE_LIMIT,
    });
  });
});
