import { homedir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { certificateCommand } from './certificate-command';

const { run, requireTool, createAuthorCertificate, exitAfter } = vi.hoisted(() => ({
  run: vi.fn(async (_command: readonly string[], _options?: unknown) => ({ code: 0, output: '' })),
  requireTool: vi.fn(() => '/tizen-studio/tools/ide/bin/tizen'),
  createAuthorCertificate: vi.fn(async (_options: unknown) => ({
    certificate: '/certs/kroma/author.crt',
    key: '/certs/kroma/author.key',
    archive: '/certs/kroma/author.p12',
    password: 'a-generated-password',
    passwordFile: '/certs/kroma/author.pwd',
  })),
  exitAfter: vi.fn((work: number | Promise<number>) => work),
}));
vi.mock('../../run', () => ({ run }));
vi.mock('../../toolchain/detect', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  requireTool,
}));
vi.mock('./certificate/authority', () => ({ createAuthorCertificate }));
vi.mock('./certificate/password', () => ({ randomPassword: () => 'a-generated-password' }));
vi.mock('../../exit-after', () => ({ exitAfter }));

const generate = (args: { name: string; register: boolean }) =>
  (certificateCommand.run as (given: { args: typeof args }) => Promise<number>)({ args });

const printed: string[] = [];

beforeEach(() => {
  printed.length = 0;
  vi.spyOn(console, 'log').mockImplementation((line: string) => void printed.push(line));
  run.mockReset();
  createAuthorCertificate.mockClear();
});

describe('certificateCommand', () => {
  it('generates the certificate under the name it was given', async () => {
    await generate({ name: 'salon', register: false });

    expect(createAuthorCertificate).toHaveBeenCalledWith({
      directory: join(homedir(), '.kroma', 'certificates', 'salon'),
      alias: 'salon',
      password: 'a-generated-password',
      subject: { commonName: 'KROMA', organization: 'KROMA' },
    });
  });

  it('says where the certificate, the key, the archive and the password landed', async () => {
    await generate({ name: 'kroma', register: false });

    expect(printed.join('\n')).toContain('/certs/kroma/author.crt');
    expect(printed.join('\n')).toContain('/certs/kroma/author.key');
    expect(printed.join('\n')).toContain('/certs/kroma/author.p12');
    expect(printed.join('\n')).toContain('/certs/kroma/author.pwd');
  });

  it('spells the registration out with the password read from its file, never printed', async () => {
    await generate({ name: 'kroma', register: false });

    expect(printed.at(-1)).toContain(
      'tizen security-profiles add -n kroma -a /certs/kroma/author.p12 -p "$(cat /certs/kroma/author.pwd)"',
    );
    expect(printed.join('\n')).not.toContain('a-generated-password');
  });

  it('registers the profile with the Tizen tools when that was asked for', async () => {
    await generate({ name: 'kroma', register: true });

    expect(run.mock.calls[0]?.[0]).toEqual([
      '/tizen-studio/tools/ide/bin/tizen',
      'security-profiles',
      'add',
      '-n',
      'kroma',
      '-a',
      '/certs/kroma/author.p12',
      '-p',
      'a-generated-password',
    ]);
  });

  it('passes on what the Tizen tools said while they added the profile', async () => {
    run.mockImplementation(async (_command, options) => {
      (options as { log: (line: string) => void }).log('Succeed to add a profile');
      return { code: 0, output: '' };
    });

    await generate({ name: 'kroma', register: true });

    expect(printed).toContain('Succeed to add a profile');
  });

  it('answers a failure when the tools would not add the profile', async () => {
    run.mockResolvedValue({ code: 1, output: 'profile already exists' });

    expect(await generate({ name: 'kroma', register: true })).toBe(1);
  });

  it('answers a success once the profile is registered', async () => {
    expect(await generate({ name: 'kroma', register: true })).toBe(0);
  });
});
