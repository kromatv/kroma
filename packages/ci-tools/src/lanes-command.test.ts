import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event } from './event';
import { main } from './lanes-command';
import type { Graph } from './rust-affected';

interface Run {
  event: Event;
  files: string[] | 'all';
  graph: Graph;
}

const run = vi.hoisted((): Run => ({
  event: { kind: 'local' },
  files: [],
  graph: {
    server: ['server:kroma-module-sdk'],
    'server:kroma-module-sdk': [],
    'server:kroma-wasm-test-runner': [],
    'server:kroma-module-audit': ['server:kroma-module-sdk'],
    'tv.kroma.vpn': ['server:kroma-module-sdk'],
    'tv.kroma.scene': [],
  },
}));

vi.mock('./event', () => ({ readEvent: () => run.event, readRepo: () => ({ slug: 'a/b' }) }));
vi.mock('./changed-files', () => ({ changedFiles: async () => run.files }));
vi.mock('./rust-graph', () => ({ dependencyGraph: () => run.graph }));

let log: string[];

function outputs(): { output: string; summary: string } {
  const dir = mkdtempSync(join(tmpdir(), 'lanes-'));
  const output = join(dir, 'output');
  const summary = join(dir, 'summary');
  writeFileSync(output, '');
  writeFileSync(summary, '');
  vi.stubEnv('GITHUB_OUTPUT', output);
  vi.stubEnv('GITHUB_STEP_SUMMARY', summary);
  return { output, summary };
}

const read = (file: string) => readFileSync(file, 'utf8');

beforeEach(() => {
  log = [];
  vi.spyOn(console, 'log').mockImplementation((line: string) => {
    log.push(line);
  });
  run.event = { kind: 'pull_request', number: 1, base: 'a', head: 'b' };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.exitCode = undefined;
});

describe('--lane', () => {
  it('prints one lane and exits non-zero when the change is not in it', async () => {
    run.files = ['modules/tv.kroma.vpn/server/src/lib.rs'];

    await main(['--lane', 'rust']);
    const rust = process.exitCode;
    await main(['--lane', 'android']);

    expect(log).toEqual(['true', 'false']);
    expect(rust).toBe(0);
    expect(process.exitCode).toBe(1);
  });

  it('refuses a lane it does not know', async () => {
    run.files = [];

    await expect(main(['--lane', 'nope'])).rejects.toThrow("unknown lane 'nope'");
  });
});

describe('--json', () => {
  it('prints the files, the lanes and every Rust job the change asks for', async () => {
    run.files = ['server/crates/kroma-module-sdk/src/lib.rs'];

    await main(['--json']);

    expect(JSON.parse(log.join('\n'))).toMatchObject({
      files: run.files,
      lanes: { rust: true },
      rust: [
        { name: 'server' },
        { name: 'module host' },
        { name: 'server clippy' },
        { name: 'modules', workspaces: ['tv.kroma.vpn'] },
      ],
      components: ['tv.kroma.vpn'],
      audit: ['tv.kroma.vpn', 'tv.kroma.scene'],
    });
  });
});

describe('step outputs', () => {
  it('writes every lane and the Rust jobs, and sums them up on the run page', async () => {
    const files = outputs();
    run.files = ['modules/tv.kroma.vpn/server/src/lib.rs'];

    await main([]);

    const output = read(files.output);
    expect(output).toContain('rust=true\n');
    expect(output).toContain('android=false\n');
    expect(output).toContain('components=true\ncomponents_only=tv.kroma.vpn\n');
    expect(output).toContain('audit=true\naudit_only=tv.kroma.vpn\n');
    const summary = read(files.summary);
    expect(summary).toMatch(/^\*\*Lanes\*\* \(1 file\(s\) changed\): .*rust/);
    expect(summary).toContain('- modules: tv.kroma.vpn');
    expect(summary).toContain('- module audit: tv.kroma.vpn');
  });

  it('turns off on a push the lanes the release workflow builds again', async () => {
    const files = outputs();
    run.event = { kind: 'push', before: 'a', after: 'b' };
    run.files = ['packages/ui/src/index.ts'];

    await main([]);

    expect(read(files.output)).toContain('fleet=false\n');
  });

  it('runs every Rust job when the changed files cannot be listed', async () => {
    const files = outputs();
    run.files = 'all';

    await main([]);

    const summary = read(files.summary);
    expect(summary).toContain('**Lanes** (every file changed)');
    expect(summary).toContain('- modules as components: tv.kroma.vpn, tv.kroma.scene');
  });

  it('leaves the Rust jobs off the run page when the change reaches none', async () => {
    const files = outputs();
    run.files = ['docs/ci.md'];

    await main([]);

    const output = read(files.output);
    expect(output).toContain('rust_shards=[]\n');
    expect(output).toContain('components=false\n');
    expect(read(files.summary)).toBe('**Lanes** (1 file(s) changed): none\n');
  });
});
