import { describe, expect, it } from 'vitest';
import { checkCompat, type ClientBuild, compareVersions } from './compat';

describe('compareVersions', () => {
  it('orders dotted numeric versions', () => {
    expect(compareVersions('0.1.31', '0.1.30')).toBe(1);
    expect(compareVersions('0.1.30', '0.1.31')).toBe(-1);
    expect(compareVersions('0.1.31', '0.1.31')).toBe(0);
    expect(compareVersions('0.2.0', '0.1.99')).toBe(1);
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1);
  });

  it('ignores trailing suffixes and pads missing parts', () => {
    expect(compareVersions('0.1.31-rc1', '0.1.31')).toBe(0);
    expect(compareVersions('0.2', '0.2.0')).toBe(0);
    expect(compareVersions('0.2.1', '0.2')).toBe(1);
  });

  it('reads a canary as the release it leads to', () => {
    expect(compareVersions('0.1.39-canary.4', '0.1.39')).toBe(0);
    expect(compareVersions('0.1.38-canary.9', '0.1.39')).toBe(-1);
  });
});

describe('non-numeric version parts', () => {
  it('reads an unparseable segment as zero', () => {
    expect(compareVersions('1.x.3', '1.0.3')).toBe(0);
    expect(compareVersions('1.x.3', '1.0.4')).toBe(-1);
  });
});

const client = (over: Partial<ClientBuild> = {}): ClientBuild => ({
  version: '0.1.31',
  minServerVersion: '0.1.0',
  ...over,
});

describe('checkCompat', () => {
  it('is ok when each side meets what the other asks', () => {
    expect(checkCompat(client(), { version: '0.1.31', minClient: '0.1.30' })).toBe('ok');
    expect(checkCompat(client({ minServerVersion: '0.1.30' }), { version: '0.1.31' })).toBe('ok');
  });

  it('flags the server as outdated when it predates the client requirement', () => {
    expect(checkCompat(client({ minServerVersion: '0.2.0' }), { version: '0.1.31' })).toBe(
      'server-outdated',
    );
  });

  it('flags the client as outdated when the server no longer serves its version', () => {
    expect(checkCompat(client(), { version: '0.1.39', minClient: '0.1.39' })).toBe(
      'client-outdated',
    );
  });

  it('lets a canary of the oldest served release through', () => {
    expect(
      checkCompat(client({ version: '0.1.39-canary.4' }), {
        version: '0.1.39',
        minClient: '0.1.39',
      }),
    ).toBe('ok');
  });

  it('gives the server the last word when both sides are unhappy', () => {
    expect(
      checkCompat(client({ minServerVersion: '0.2.0' }), {
        version: '0.1.39',
        minClient: '0.1.39',
      }),
    ).toBe('client-outdated');
  });

  it('never warns on dev/unknown placeholders', () => {
    expect(checkCompat(client({ minServerVersion: 'dev' }), { version: '0.1.31' })).toBe('ok');
    expect(checkCompat(client(), { version: 'unknown' })).toBe('ok');
    expect(
      checkCompat(client({ version: 'dev' }), { version: '0.1.39', minClient: '0.1.39' }),
    ).toBe('ok');
    expect(checkCompat(client(), { version: '0.1.39', minClient: null })).toBe('ok');
  });
});
