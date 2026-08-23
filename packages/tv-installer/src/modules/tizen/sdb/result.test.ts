import { describe, expect, it } from 'vitest';
import { describeResult, parseResult } from './result';

describe('an install result', () => {
  it('reads a pkgcmd success', () => {
    const output =
      'spend time for pkgcmd is 3419.000000 ms\nprocessing result : OK [0] succeeded\n';

    expect(parseResult(output)).toMatchObject({ verdict: 'success', code: 0 });
  });

  it('reads a pkgcmd failure and keeps its code', () => {
    const output = 'processing result : FAIL [-12] Signature error\n';

    expect(parseResult(output)).toMatchObject({ verdict: 'failure', code: -12 });
  });

  it('trusts the appcmd exit code over anything else in the output', () => {
    const output = 'appcmd_returnstr:install completed\nappcmd_exitcode:1\n';

    expect(parseResult(output)).toMatchObject({ verdict: 'failure', code: 1 });
  });

  it('reads an appcmd success', () => {
    expect(parseResult('appcmd_exitcode:0\n')).toMatchObject({ verdict: 'success', code: 0 });
  });

  it('reads the television wording', () => {
    const output = 'spend time for vd_appinstall is 5000 ms\ninstall completed\n';

    expect(parseResult(output).verdict).toBe('success');
  });

  it('calls a rejected command a failure', () => {
    expect(parseResult('sh: 0: command not found\n').verdict).toBe('failure');
  });

  it('calls silence unknown rather than either verdict', () => {
    expect(parseResult('   \n').verdict).toBe('unknown');
    expect(parseResult('sending: 100%\n').verdict).toBe('unknown');
  });
});

describe('a launch result', () => {
  it('reads the launcher answering with an id', () => {
    expect(parseResult('app_id is [KromaTV001.KROMA]\n').verdict).toBe('success');
  });
});

describe('the description', () => {
  it('names the action, the verdict and the last thing the set said', () => {
    const result = parseResult('processing result : OK [0] succeeded\n');

    expect(describeResult('install', result)).toBe(
      'install success [0]: processing result : OK [0] succeeded',
    );
  });

  it('says only the verdict when the set printed nothing at all', () => {
    expect(describeResult('launch', parseResult(''))).toBe('launch unknown');
  });

  it('keeps the last three lines only', () => {
    const result = parseResult('one\ntwo\nthree\nfour\n');

    expect(describeResult('install', result)).toBe('install unknown: two / three / four');
  });
});
