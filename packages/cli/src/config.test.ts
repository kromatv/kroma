import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { configPath, normalizeServer, readConfig, writeConfig } from './config';

const work = mkdtempSync(join(tmpdir(), 'kroma-config-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));
afterEach(() => vi.unstubAllEnvs());

describe('configPath', () => {
  it('takes KROMA_CLI_CONFIG as the whole path', () => {
    vi.stubEnv('KROMA_CLI_CONFIG', '/etc/kroma/cli.json');

    expect(configPath()).toBe('/etc/kroma/cli.json');
  });

  it('follows XDG_CONFIG_HOME when nothing overrides it', () => {
    vi.stubEnv('KROMA_CLI_CONFIG', undefined);
    vi.stubEnv('XDG_CONFIG_HOME', '/xdg');

    expect(configPath()).toBe(join('/xdg', 'kroma', 'cli.json'));
  });

  it('falls back to ~/.config', () => {
    vi.stubEnv('KROMA_CLI_CONFIG', undefined);
    vi.stubEnv('XDG_CONFIG_HOME', undefined);

    expect(configPath()).toBe(join(homedir(), '.config', 'kroma', 'cli.json'));
  });
});

describe('readConfig', () => {
  it('reads a config that is not there as no servers at all', () => {
    expect(readConfig(join(work, 'missing.json'))).toEqual({ servers: {} });
  });

  it('reads a corrupt file the same way, so a half-written one locks nobody out', () => {
    const path = join(work, 'corrupt.json');
    writeFileSync(path, '{ "servers":');

    expect(readConfig(path)).toEqual({ servers: {} });
  });

  it('reads the default server and the login stored for each', () => {
    const path = join(work, 'stored.json');
    const stored = {
      defaultServer: 'https://kroma.local',
      servers: { 'https://kroma.local': { token: 'tok', user: 'max' } },
    };
    writeFileSync(path, JSON.stringify(stored));

    expect(readConfig(path)).toEqual(stored);
  });
});

describe('writeConfig', () => {
  it('creates the directories on the way to the file it writes', () => {
    const path = join(work, 'nested', 'deeper', 'cli.json');
    const config = { servers: { 'http://localhost:4040': { token: 'tok' } } };

    writeConfig(config, path);

    expect(readConfig(path)).toEqual(config);
  });

  it('writes the token file readable by its owner alone', () => {
    const path = join(work, 'private', 'cli.json');

    writeConfig({ servers: {} }, path);

    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('tightens a token file that already existed world-readable', () => {
    const path = join(work, 'loose', 'cli.json');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '{}', { mode: 0o644 });

    writeConfig({ servers: {} }, path);

    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
});

describe('normalizeServer', () => {
  it('assumes http for a host typed without a scheme', () => {
    expect(normalizeServer('kroma.local:4040')).toBe('http://kroma.local:4040');
  });

  it('keeps https where it was typed', () => {
    expect(normalizeServer('https://kroma.tv')).toBe('https://kroma.tv');
  });

  it('drops every trailing slash, so one server keys the config once', () => {
    expect(normalizeServer('http://kroma.local:4040///')).toBe('http://kroma.local:4040');
    expect(normalizeServer('kroma.local/')).toBe('http://kroma.local');
  });
});
