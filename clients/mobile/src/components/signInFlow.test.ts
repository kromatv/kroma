// Entering a remembered profile from the gate: the stored device token, the
// standalone Face ID lock, the PIN vault, the PIN pad, and finally that
// profile's password, tried in a fixed order where each step's failure is a
// different destination. The device lock is checked before the token is
// spent; a vaulted PIN the server rejects is dropped, not retried; a revoked
// token falls back to the password rather than being read as a wrong PIN.

import { KromaApiError } from '@kroma/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const passProfileBiometricGate = vi.hoisted(() => vi.fn(async () => true));
vi.mock('#mobile/lib/biometricGate', () => ({ passProfileBiometricGate }));

const isBiometricUnlockEnabled = vi.hoisted(() => vi.fn(async () => true));
const readPinBehindBiometrics = vi.hoisted(() => vi.fn(async () => null as string | null));
const savePinBehindBiometrics = vi.hoisted(() => vi.fn(async () => true));
const deletePinBehindBiometrics = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('#mobile/lib/storage', () => ({
  isBiometricUnlockEnabled,
  readPinBehindBiometrics,
  savePinBehindBiometrics,
  deletePinBehindBiometrics,
}));

import type { MobileAccount } from '#mobile/lib/storage';
import { type EnterSavedDeps, enterSavedAccount, type Phase } from './signInFlow';

const account = (over: Partial<MobileAccount['user']> = {}): MobileAccount =>
  ({
    serverUrl: 'https://attic',
    accessToken: 'device-token',
    user: { id: 'u1', username: 'max', avatarUrl: null, ...over },
  }) as MobileAccount;

function deps(switchAccount: (a: MobileAccount, pin?: string) => Promise<void>) {
  const state = {
    busy: [] as Array<string | null>,
    error: [] as Array<string | null>,
    pin: [] as string[],
    phase: [] as Phase[],
    entered: 0,
    forgot: [] as MobileAccount[],
    selected: [] as string[],
  };
  const d = {
    session: {
      switchAccount: vi.fn(switchAccount),
      forgetAccount: (a: MobileAccount) => state.forgot.push(a),
      selectServer: (url: string) => state.selected.push(url),
    },
    t: (key: string) => key,
    enterApp: () => {
      state.entered += 1;
    },
    setBusy: (b: string | null) => state.busy.push(b),
    setError: (e: string | null) => state.error.push(e),
    setPin: (p: string) => state.pin.push(p),
    setPhase: (p: Phase) => state.phase.push(p),
  };
  // `d` keeps its inferred type so the tests can read `d.session.switchAccount`;
  // the cast happens where it is handed to the flow.
  return { d, state };
}

const ok = async () => undefined;
const pinRequired = async () => {
  throw new KromaApiError(401, 'pin required', { pinRequired: true });
};
const revoked = async () => {
  throw new KromaApiError(401, 'unauthorized', { error: 'revoked' });
};

beforeEach(() => {
  vi.clearAllMocks();
  passProfileBiometricGate.mockResolvedValue(true);
  isBiometricUnlockEnabled.mockResolvedValue(true);
  readPinBehindBiometrics.mockResolvedValue(null);
  savePinBehindBiometrics.mockResolvedValue(true);
});

describe('the device lock, before anything else', () => {
  it('stops when the prompt fails, without spending the token', async () => {
    passProfileBiometricGate.mockResolvedValue(false);
    const { d, state } = deps(ok);
    await enterSavedAccount(d as unknown as EnterSavedDeps, account());

    expect(d.session.switchAccount).not.toHaveBeenCalled();
    expect(state.entered).toBe(0);
    expect(state.busy.at(-1)).toBeNull();
  });

  it('asks about the profile being opened, in its language', async () => {
    const { d } = deps(ok);
    await enterSavedAccount(d as unknown as EnterSavedDeps, account());
    expect(passProfileBiometricGate).toHaveBeenCalledWith(
      expect.objectContaining({ serverUrl: 'https://attic' }),
      'auth.faceUnlock',
    );
  });
});

describe('the stored device token', () => {
  it('opens the app when it still works', async () => {
    const { d, state } = deps(ok);
    await enterSavedAccount(d as unknown as EnterSavedDeps, account());
    expect(state.entered).toBe(1);
    expect(state.error.at(-1)).toBeNull();
  });

  it('marks the row busy while it tries', async () => {
    const { d, state } = deps(ok);
    await enterSavedAccount(d as unknown as EnterSavedDeps, account());
    // Keyed on the account, so the gate spins the ROW that was tapped rather
    // than the whole screen.
    expect(state.busy[0]).toBe('https://attic::u1');
  });

  it('marks the PAD busy when a typed PIN is being checked', async () => {
    const { d, state } = deps(ok);
    await enterSavedAccount(d as unknown as EnterSavedDeps, account(), '1234');
    expect(state.busy[0]).toBe('pin');
  });
});

describe('when the server asks for a PIN', () => {
  it('unlocks silently from the vault', async () => {
    readPinBehindBiometrics.mockResolvedValue('1234');
    const attempts: Array<string | undefined> = [];
    const { d, state } = deps(async (_a, pin) => {
      attempts.push(pin);
      if (pin === undefined) await pinRequired();
    });

    await enterSavedAccount(d as unknown as EnterSavedDeps, account());
    expect(attempts).toEqual([undefined, '1234']);
    expect(state.entered).toBe(1);
    expect(state.phase).toEqual([]);
  });

  it('opens the pad when the vault is empty', async () => {
    readPinBehindBiometrics.mockResolvedValue(null);
    const { d, state } = deps(pinRequired);
    await enterSavedAccount(d as unknown as EnterSavedDeps, account());

    expect(state.phase.at(-1)).toMatchObject({ kind: 'pin' });
    expect(state.pin.at(-1)).toBe('');
    expect(state.busy.at(-1)).toBeNull();
  });

  it('does not even read the vault when biometric unlock is off', async () => {
    isBiometricUnlockEnabled.mockResolvedValue(false);
    const { d, state } = deps(pinRequired);
    await enterSavedAccount(d as unknown as EnterSavedDeps, account());

    expect(readPinBehindBiometrics).not.toHaveBeenCalled();
    expect(state.phase.at(-1)).toMatchObject({ kind: 'pin' });
  });

  it('DROPS a vaulted PIN the server no longer accepts', async () => {
    readPinBehindBiometrics.mockResolvedValue('old');
    const { d, state } = deps(pinRequired);
    await enterSavedAccount(d as unknown as EnterSavedDeps, account());

    // Left behind, every future unlock would fail Face ID first, then the pad.
    expect(deletePinBehindBiometrics).toHaveBeenCalledWith('https://attic', 'u1');
    expect(state.phase.at(-1)).toMatchObject({ kind: 'pin' });
  });
});

describe('a PIN typed on the pad', () => {
  it('opens the app and is kept behind Face ID', async () => {
    const { d, state } = deps(ok);
    await enterSavedAccount(d as unknown as EnterSavedDeps, account(), '1234');

    expect(state.entered).toBe(1);
    await vi.waitFor(() =>
      expect(savePinBehindBiometrics).toHaveBeenCalledWith('https://attic', 'u1', '1234'),
    );
  });

  it('is NOT kept when biometric unlock is off for that profile', async () => {
    isBiometricUnlockEnabled.mockResolvedValue(false);
    const { d, state } = deps(ok);
    await enterSavedAccount(d as unknown as EnterSavedDeps, account(), '1234');

    expect(state.entered).toBe(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(savePinBehindBiometrics).not.toHaveBeenCalled();
  });

  it('is never stored when it was not typed', async () => {
    const { d } = deps(ok);
    await enterSavedAccount(d as unknown as EnterSavedDeps, account());
    await Promise.resolve();
    expect(savePinBehindBiometrics).not.toHaveBeenCalled();
  });

  it('stays on the pad when it is wrong, showing the server’s own message', async () => {
    const { d, state } = deps(async () => {
      throw new KromaApiError(401, 'bad pin', { error: 'Too many attempts, try again in 30s' });
    });
    await enterSavedAccount(d as unknown as EnterSavedDeps, account(), '9999');

    // The server's message says why (wrong, or locked out); a generic string
    // would lose the retry delay.
    expect(state.error.at(-1)).toBe('Too many attempts, try again in 30s');
    expect(state.pin.at(-1)).toBe('');
    expect(state.phase).toEqual([]);
  });

  it('falls back to a generic message when the server sends none', async () => {
    const { d, state } = deps(async () => {
      throw new KromaApiError(401, 'bad pin');
    });
    await enterSavedAccount(d as unknown as EnterSavedDeps, account(), '9999');
    expect(state.error.at(-1)).toBe('auth.pinIncorrect');
  });
});

describe('a revoked device token', () => {
  it('falls back to that profile’s password', async () => {
    const { d, state } = deps(revoked);
    await enterSavedAccount(
      d as unknown as EnterSavedDeps,
      account({ username: 'max', avatarUrl: 'https://a/av.png' }),
    );

    expect(state.phase.at(-1)).toEqual({
      kind: 'password',
      username: 'max',
      avatarUrl: 'https://a/av.png',
    });
  });

  it('forgets the dead credential and pre-selects the server', async () => {
    const { d, state } = deps(revoked);
    await enterSavedAccount(d as unknown as EnterSavedDeps, account());

    expect(state.forgot).toHaveLength(1);
    expect(state.selected).toEqual(['https://attic']);
  });

  it('says why the password is being asked for', async () => {
    const { d, state } = deps(revoked);
    await enterSavedAccount(d as unknown as EnterSavedDeps, account());
    expect(state.error.at(-1)).toBe('auth.sessionExpiredHint');
  });

  it('carries a null avatar rather than undefined', async () => {
    const { d, state } = deps(revoked);
    await enterSavedAccount(d as unknown as EnterSavedDeps, account({ avatarUrl: undefined }));
    expect(state.phase.at(-1)).toMatchObject({ avatarUrl: null });
  });
});

describe('a failure that is not the server refusing', () => {
  it('reports a generic sign-in failure and stays put', async () => {
    const { d, state } = deps(async () => {
      throw new TypeError('Network request failed');
    });
    await enterSavedAccount(d as unknown as EnterSavedDeps, account());

    // Forgetting the account here would cost the profile over a dropped connection.
    expect(state.error.at(-1)).toBe('auth.loginFailed');
    expect(state.forgot).toEqual([]);
    expect(state.phase).toEqual([]);
    expect(state.busy.at(-1)).toBeNull();
  });
});
