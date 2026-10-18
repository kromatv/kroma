// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmHost, type ConfirmOptions, useConfirm } from './confirm';

vi.mock('./confirm-dialog', () => ({
  ConfirmDialog: ({
    title,
    onConfirm,
    onClose,
  }: {
    title: string;
    onConfirm: () => void;
    onClose: () => void;
  }) => (
    <section aria-label={title}>
      <button type="button" onClick={onConfirm}>
        Yes
      </button>
      <button type="button" onClick={onClose}>
        No
      </button>
    </section>
  ),
}));

afterEach(cleanup);
const options = (title: string): ConfirmOptions => ({
  title,
  confirmLabel: 'Yes',
  cancelLabel: 'No',
});

describe('app-owned confirmation queues', () => {
  it('fails closed when the caller has no host', async () => {
    const { result } = renderHook(useConfirm);
    await expect(result.current(options('No host'))).resolves.toBe(false);
  });

  it('keeps independent roots separate when one unmounts', async () => {
    const first = renderHook(useConfirm, { wrapper: ConfirmHost });
    const second = renderHook(useConfirm, { wrapper: ConfirmHost });
    let a!: Promise<boolean>;
    let b!: Promise<boolean>;
    act(() => {
      a = first.result.current(options('First'));
      b = second.result.current(options('Second'));
    });
    const answered = vi.fn();
    void b.then(answered);
    first.unmount();
    await expect(a).resolves.toBe(false);
    expect(answered).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'First' })).toBeNull();
    fireEvent.click(within(screen.getByRole('region', { name: 'Second' })).getByText('Yes'));
    await expect(b).resolves.toBe(true);
  });

  it('answers one question at a time and cancels queued questions on teardown', async () => {
    const host = renderHook(useConfirm, { wrapper: ConfirmHost });
    let a!: Promise<boolean>;
    let b!: Promise<boolean>;
    act(() => {
      a = host.result.current(options('First'));
      b = host.result.current(options('Next'));
    });
    expect(screen.queryByRole('region', { name: 'Next' })).toBeNull();
    fireEvent.click(within(screen.getByRole('region', { name: 'First' })).getByText('No'));
    await expect(a).resolves.toBe(false);
    expect(screen.getByRole('region', { name: 'Next' })).toBeTruthy();
    host.unmount();
    await expect(b).resolves.toBe(false);
  });
});
