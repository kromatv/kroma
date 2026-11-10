import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SDB, TIZEN_CLI, TIZEN_HOME } from './tools';

describe('TIZEN_CLI', () => {
  it('looks for the CLI where Tizen Studio installs it', () => {
    expect(TIZEN_CLI.candidates?.()).toEqual([join(TIZEN_HOME, 'tools', 'ide', 'bin', 'tizen')]);
  });

  it('is never fetched by this tool, which installs without it', () => {
    expect(TIZEN_CLI.install).toBeUndefined();
  });
});

describe('SDB', () => {
  it('looks for the bridge where Tizen Studio installs it', () => {
    expect(SDB.candidates?.()).toEqual([join(TIZEN_HOME, 'tools', 'sdb')]);
  });

  it('is never fetched by this tool, which talks to the set itself', () => {
    expect(SDB.install).toBeUndefined();
  });
});
