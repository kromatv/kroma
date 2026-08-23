import { afterEach, describe, expect, it, vi } from 'vitest';

const present = vi.hoisted(() => new Set<string>());
vi.mock('node:fs', () => ({ existsSync: (path: string) => present.has(path) }));

async function resolvedWith(installed: string[], path: string | undefined): Promise<string> {
  present.clear();
  for (const candidate of installed) present.add(candidate);
  vi.stubEnv('PATH', path);
  vi.resetModules();
  return (await import('./openssl')).OPENSSL;
}

afterEach(() => vi.unstubAllEnvs());

describe('OPENSSL', () => {
  it('is the first of the fixed locations this machine has one at', async () => {
    const found = await resolvedWith(
      ['/opt/homebrew/bin/openssl', '/usr/local/bin/openssl'],
      '/opt/homebrew/bin',
    );

    expect(found).toBe('/opt/homebrew/bin/openssl');
  });

  it('prefers a fixed location to whatever PATH would have found', async () => {
    const found = await resolvedWith(
      ['/usr/bin/openssl', '/opt/impostor/openssl'],
      '/opt/impostor',
    );

    expect(found).toBe('/usr/bin/openssl');
  });

  it('falls back to the first entry on PATH holding one', async () => {
    const found = await resolvedWith(['/opt/tools/openssl'], '/nothing/here:/opt/tools');

    expect(found).toBe('/opt/tools/openssl');
  });

  it('passes over an empty PATH entry instead of the working directory', async () => {
    const found = await resolvedWith(['openssl', '/opt/tools/openssl'], ':/opt/tools');

    expect(found).toBe('/opt/tools/openssl');
  });

  it('answers the bare name when no entry on PATH holds one', async () => {
    expect(await resolvedWith([], '/nothing/here:/nor/there')).toBe('openssl');
  });

  it('answers the bare name when there is no PATH to search', async () => {
    expect(await resolvedWith([], undefined)).toBe('openssl');
  });
});
