// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBackupRestore } from './use-backup-restore.hook';

const mocks = vi.hoisted(() => ({ preview: vi.fn(), restore: vi.fn() }));
vi.mock('@kromatv/ui', () => ({ useT: () => (key: string) => key }));
vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({
    client: { admin: { backup: { preview: mocks.preview, import: mocks.restore } } },
  }),
}));

const file = new File(['zip'], 'kroma-backup.kroma');
const films = [{ id: 'films', name: 'Films' }];

function restoring({ encrypted }: { encrypted: boolean } = { encrypted: false }) {
  const onDone = vi.fn();
  const hook = renderHook(() => useBackupRestore({ file, encrypted, onDone }));
  return { hook, onDone };
}

beforeEach(() => {
  mocks.preview.mockResolvedValue({ removedLibraries: [] });
  mocks.restore.mockResolvedValue({ imported: { users: 2 }, rescanStarted: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('a restore from the import dialog', () => {
  it('restores at once when it is not a reset, and asks nothing first', async () => {
    const { hook, onDone } = restoring();

    await act(() => hook.result.current.run());

    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.restore).toHaveBeenCalledWith(file, { password: undefined, reset: false });
    expect(onDone).toHaveBeenCalledWith('admin.backupImported');
  });

  it('shows what a reset removes and restores only when asked a second time', async () => {
    mocks.preview.mockResolvedValue({ removedLibraries: films });
    const { hook, onDone } = restoring();
    act(() => hook.result.current.setReset(true));

    await act(() => hook.result.current.run());
    const shown = hook.result.current.removing;
    await act(() => hook.result.current.run());

    expect(shown).toEqual(films);
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    expect(mocks.restore).toHaveBeenCalledWith(file, { password: undefined, reset: true });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('restores a reset that removes nothing without stopping on the way', async () => {
    const { hook, onDone } = restoring();
    act(() => hook.result.current.setReset(true));

    await act(() => hook.result.current.run());

    expect(mocks.preview).toHaveBeenCalledTimes(1);
    expect(mocks.restore).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('sends the password of an encrypted backup without its surrounding spaces', async () => {
    const { hook } = restoring({ encrypted: true });
    act(() => hook.result.current.setPassword('  hunter2  '));

    await act(() => hook.result.current.run());

    expect(mocks.restore).toHaveBeenCalledWith(file, { password: 'hunter2', reset: false });
  });

  it('says the restore failed and is ready to try again', async () => {
    mocks.restore.mockRejectedValue(new Error('offline'));
    const { hook, onDone } = restoring();

    await act(() => hook.result.current.run());

    expect(hook.result.current.error).toBe('admin.backupImportFailed');
    expect(hook.result.current.busy).toBe(false);
    expect(onDone).not.toHaveBeenCalled();
  });
});
