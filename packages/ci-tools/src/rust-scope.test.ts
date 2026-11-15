import { describe, expect, it } from 'vitest';
import { scope, testPart } from './rust-scope';
import { SERVER, workspaces } from './rust-workspaces';

const module = () => {
  const found = workspaces().find((ws) => ws.id !== SERVER.id);
  if (found === undefined) {
    throw new Error('the repository has no module workspace');
  }
  return found;
};

describe('which packages a Rust run reaches', () => {
  it('takes the whole server workspace when no part is asked for', () => {
    expect(scope(SERVER)).toEqual(['--workspace']);
  });

  it('splits the server into the crates that run components and every other one', () => {
    const host = scope(SERVER, 'host');
    const core = scope(SERVER, 'core');

    expect(host).toContain('kroma-module-supervisor');
    expect(host.filter((arg) => arg === '-p')).toHaveLength(4);
    expect(core.slice(0, 1)).toEqual(['--workspace']);
    expect(core.filter((arg) => arg !== '--workspace' && arg !== '--exclude')).toEqual(
      host.filter((arg) => arg !== '-p'),
    );
  });

  it('leaves a module workspace whole whatever the part', () => {
    expect(scope(module(), 'host')).toEqual([]);
  });
});

describe('the part a run is asked for', () => {
  it('reads the two parts and the absence of one', () => {
    expect(testPart('core')).toBe('core');
    expect(testPart('host')).toBe('host');
    expect(testPart(undefined)).toBeUndefined();
  });

  it('refuses a part it does not know', () => {
    expect(() => testPart('clippy')).toThrow("not 'clippy'");
  });
});
