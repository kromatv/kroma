import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SDB, TIZEN_CLI, TIZEN_HOME } from './tools';

describe('TIZEN_CLI', () => {
  it('looks for the CLI where Tizen Studio installs it', () => {
    expect(TIZEN_CLI.candidates?.()).toEqual([join(TIZEN_HOME, 'tools', 'ide', 'bin', 'tizen')]);
  });
});

describe('SDB', () => {
  it('looks for the bridge where Tizen Studio installs it', () => {
    expect(SDB.candidates?.()).toEqual([join(TIZEN_HOME, 'tools', 'sdb')]);
  });
});
