import * as p from '@clack/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Television } from '../../shared/television';
import { AdbConnection, AdbUnpaired } from './adb/connection';
import { adbKeys } from './adb/key';
import { adbEndpoint } from './endpoint';
import { pairSet } from './pair-set';
import { askPairingCodes } from './prompt';

vi.mock('@clack/prompts', () => {
  const CANCEL_SYMBOL = Symbol('cancelled');
  return {
    CANCEL_SYMBOL,
    isCancel: (value: unknown) => value === CANCEL_SYMBOL,
    log: { info: vi.fn(), success: vi.fn(), warn: vi.fn() },
    text: vi.fn(),
  };
});
vi.mock('./adb/key', () => ({ adbKeys: vi.fn() }));
vi.mock('./endpoint', () => ({ adbEndpoint: vi.fn() }));
vi.mock('./pair-set', async (original) => ({
  ...(await original<typeof import('./pair-set')>()),
  pairSet: vi.fn(),
}));

const set = (host: string, name: string): Television => ({
  host,
  platform: 'androidtv',
  vendor: 'Google',
  name,
  model: 'Chromecast HD',
  developerMode: 'on',
  sideloadable: true,
  note: '',
  runtime: null,
});

const salon = set('192.168.1.78', 'Salon');
const chambre = set('192.168.1.79', 'Chambre');
const open = vi.spyOn(AdbConnection, 'open');
const connection = { close: vi.fn() } as unknown as AdbConnection;

beforeEach(() => {
  vi.mocked(adbKeys).mockResolvedValue([]);
  vi.mocked(adbEndpoint).mockResolvedValue({ port: 35221, wireless: true });
  vi.mocked(pairSet).mockResolvedValue(undefined);
  open.mockRejectedValue(new AdbUnpaired('never paired'));
});

afterEach(() => vi.resetAllMocks());

describe('askPairingCodes', () => {
  it('pairs a set on Wireless debugging that does not trust this computer, from the code typed', async () => {
    vi.mocked(p.text).mockResolvedValue(' 701 965 ');

    const answers = await askPairingCodes([salon]);

    expect(vi.mocked(p.text).mock.calls[0]?.[0].message).toBe(
      'pairing code for Salon (192.168.1.78)',
    );
    expect(pairSet).toHaveBeenCalledWith('192.168.1.78', '701965');
    expect(p.log.success).toHaveBeenCalledWith('Salon is paired with this computer');
    expect(answers?.size).toBe(0);
  });

  it('asks nothing of a set that already trusts this computer', async () => {
    open.mockResolvedValue(connection);

    await askPairingCodes([salon]);

    expect(p.text).not.toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalled();
  });

  it('asks nothing of a set in Network debugging, which prompts on its own screen', async () => {
    vi.mocked(adbEndpoint).mockResolvedValue({ port: 5555, wireless: false });

    await askPairingCodes([salon]);

    expect(p.text).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('asks nothing of a set that answers no adb, and leaves the install to say so', async () => {
    vi.mocked(adbEndpoint).mockResolvedValue(null);
    open.mockRejectedValue(new Error('ECONNREFUSED'));

    expect((await askPairingCodes([salon]))?.size).toBe(0);
    expect(p.text).not.toHaveBeenCalled();
  });

  it('asks nothing of a set that failed for another reason than pairing', async () => {
    open.mockRejectedValue(new Error('the TV stopped answering adb'));

    await askPairingCodes([salon]);

    expect(p.text).not.toHaveBeenCalled();
  });

  it('says why a code did not work, and asks for it again', async () => {
    vi.mocked(p.text).mockResolvedValueOnce('111111').mockResolvedValueOnce('701965');
    vi.mocked(pairSet).mockRejectedValueOnce(new Error('the TV refused that pairing code'));

    await askPairingCodes([salon]);

    expect(p.log.warn).toHaveBeenCalledWith('the TV refused that pairing code');
    expect(pairSet).toHaveBeenLastCalledWith('192.168.1.78', '701965');
  });

  it('refuses to send anything that is not six digits', async () => {
    vi.mocked(p.text).mockResolvedValue('701965');

    await askPairingCodes([salon]);
    const given = vi.mocked(p.text).mock.calls[0]?.[0].validate;
    const validate = typeof given === 'function' ? given : () => 'no check at all';

    expect(validate('7019')).toBe('the six digits the TV shows');
    expect(validate(undefined)).toBe('the six digits the TV shows');
    expect(validate('701 965')).toBeUndefined();
  });

  it('explains where the code is once, however many sets want one', async () => {
    vi.mocked(p.text).mockResolvedValue('701965');

    await askPairingCodes([salon, chambre]);

    expect(p.log.info).toHaveBeenCalledTimes(1);
    expect(p.text).toHaveBeenCalledTimes(2);
  });

  it('answers nothing at all when the question was cancelled', async () => {
    vi.mocked(p.text).mockResolvedValue(p.CANCEL_SYMBOL);

    expect(await askPairingCodes([salon, chambre])).toBeNull();
    expect(pairSet).not.toHaveBeenCalled();
  });
});
