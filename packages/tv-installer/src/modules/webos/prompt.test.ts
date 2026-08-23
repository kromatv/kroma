import * as p from '@clack/prompts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Television } from '../../television';
import { askPassphrases } from './prompt';

vi.mock('@clack/prompts', () => ({
  isCancel: (value: unknown) => value === CANCELLED,
  log: { info: vi.fn() },
  password: vi.fn(),
}));

const CANCELLED = Symbol('cancelled');

const set = (host: string, name: string): Television => ({
  host,
  platform: 'webos',
  vendor: 'LG',
  name,
  model: 'OLED55C1',
  developerMode: 'on',
  sideloadable: true,
  note: '',
  runtime: null,
});

const sets = [set('192.168.1.44', 'Chambre'), set('192.168.1.45', 'Salon')];

afterEach(() => {
  vi.clearAllMocks();
});

describe('askPassphrases', () => {
  it('asks for the passphrase of every set, and keeps it by address', async () => {
    vi.mocked(p.password).mockResolvedValueOnce('A1B2C3').mockResolvedValueOnce('D4E5F6');

    const answers = await askPassphrases(sets);

    expect(vi.mocked(p.password).mock.calls[0]?.[0]?.message).toBe(
      'passphrase for Chambre (192.168.1.44)',
    );
    expect([...(answers ?? [])]).toEqual([
      ['192.168.1.44', { passphrase: 'A1B2C3' }],
      ['192.168.1.45', { passphrase: 'D4E5F6' }],
    ]);
  });

  it('keeps nothing for a set this computer already holds the key of', async () => {
    vi.mocked(p.password).mockResolvedValue('');

    expect((await askPassphrases(sets))?.size).toBe(0);
  });

  it('answers nothing at all when the question was cancelled', async () => {
    vi.mocked(p.password).mockResolvedValue(CANCELLED);

    expect(await askPassphrases(sets)).toBeNull();
  });
});
