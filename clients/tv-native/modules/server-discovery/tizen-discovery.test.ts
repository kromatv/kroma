import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const sources = path.join(import.meta.dirname, 'tizen');
const build = mkdtempSync(path.join(tmpdir(), 'kroma-discovery-'));
const binary = path.join(build, 'discovery');

execFileSync('/usr/bin/c++', [
  '-std=c++20',
  '-Wall',
  '-Wextra',
  '-o',
  binary,
  ...['test/DiscoveryTest.cpp', 'DnsMessage.cpp', 'ServiceCollector.cpp'].map((file) =>
    path.join(sources, file),
  ),
]);

const cases = execFileSync(binary, { encoding: 'utf8' }).trim().split('\n');

afterAll(() => rmSync(build, { recursive: true, force: true }));

describe('the Tizen server discovery', () => {
  it.each(cases)('%s', (name) => {
    const run = spawnSync(binary, [name], { encoding: 'utf8' });

    expect(run.stdout).toBe('');
    expect(run.status).toBe(0);
  });
});
