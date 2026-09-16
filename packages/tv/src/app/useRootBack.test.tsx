// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TvNavProvider } from '#tv/app/router';
import { stubScreens } from '#tv/app/router.fixtures';
import { useRootBack } from '#tv/app/useRootBack';

const confirmMock = vi.fn(async () => true);

vi.mock('@kromatv/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kromatv/ui')>()),
  useT: () => (key: string) => key,
}));

vi.mock('@kromatv/ui/kit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kromatv/ui/kit')>()),
  confirm: () => confirmMock(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  confirmMock.mockClear();
  confirmMock.mockResolvedValue(true);
});

function wrapper(onExit?: () => void) {
  return ({ children }: Readonly<{ children: ReactNode }>) => (
    <TvNavProvider screens={stubScreens()} onExit={onExit}>
      {children}
    </TvNavProvider>
  );
}

function tizen() {
  vi.stubGlobal('tizen', { application: { getCurrentApplication: () => ({ exit: () => {} }) } });
}

describe('useRootBack', () => {
  it('stays unbound where no shell offers a way out', () => {
    const { result } = renderHook(() => useRootBack(), { wrapper: wrapper() });

    expect(result.current).toBeUndefined();
  });

  it('asks before it closes on Tizen, which Samsung requires of the application', async () => {
    tizen();
    const onExit = vi.fn();
    const { result } = renderHook(() => useRootBack(), { wrapper: wrapper(onExit) });

    await act(async () => result.current?.());

    expect(confirmMock).toHaveBeenCalledOnce();
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('stays in the app when the answer is no', async () => {
    tizen();
    confirmMock.mockResolvedValue(false);
    const onExit = vi.fn();
    const { result } = renderHook(() => useRootBack(), { wrapper: wrapper(onExit) });

    await act(async () => result.current?.());

    expect(onExit).not.toHaveBeenCalled();
  });

  it('leaves a press unhandled while the question is up, so the panel takes it', async () => {
    tizen();
    let answer: (yes: boolean) => void = () => {};
    confirmMock.mockImplementation(() => new Promise<boolean>((r) => (answer = r)));
    const { result } = renderHook(() => useRootBack(), { wrapper: wrapper(vi.fn()) });

    await act(async () => result.current?.());
    const second = result.current?.();

    expect(second).toBe(false);
    expect(confirmMock).toHaveBeenCalledOnce();

    await act(async () => answer(false));

    expect(result.current?.()).not.toBe(false);
  });

  it('hands webOS its platform Back without a second prompt', async () => {
    vi.stubGlobal('PalmSystem', { platformBack: () => {} });
    const onExit = vi.fn();
    const { result } = renderHook(() => useRootBack(), { wrapper: wrapper(onExit) });

    await act(async () => result.current?.());

    expect(confirmMock).not.toHaveBeenCalled();
    expect(onExit).toHaveBeenCalledOnce();
  });
});
