// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeEntry } from './code-entry.component';

const authorize = vi.hoisted(() => vi.fn());
vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({ client: { accounts: { quickConnect: { authorize } } } }),
}));

const inputHost = createInputTestHost();

beforeEach(() => {
  inputHost.clearPressGuard();
  authorize.mockReset();
  authorize.mockResolvedValue(undefined);
});

afterEach(cleanup);

function show(initial: string) {
  return inputHost.render(
    <I18nProvider locale="en">
      <CodeEntry initial={initial} />
    </I18nProvider>,
  );
}

describe('the code form', () => {
  it('keeps the button off until four characters are typed', () => {
    show('AB');

    expect(screen.getByRole('button', { name: 'Authorize' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
  });

  it('confirms once a full code is accepted', async () => {
    show('AB12');

    expect(await screen.findByText('Device connected')).toBeTruthy();
    expect(authorize).toHaveBeenCalledWith('AB12');
  });

  it('says the code is wrong when it is refused', async () => {
    authorize.mockRejectedValue(new Error('refused'));

    show('AB12');

    expect(await screen.findByText(/Wrong or expired code/)).toBeTruthy();
  });

  it('sends the code again when the form is submitted after a refusal', async () => {
    authorize.mockRejectedValueOnce(new Error('refused'));
    show('AB12');
    await screen.findByText(/Wrong or expired code/);

    fireEvent.submit(screen.getByRole('button', { name: 'Authorize' }));

    await waitFor(() => expect(authorize).toHaveBeenCalledTimes(2));
  });

  it('sends the code again when the button is pressed after a refusal', async () => {
    authorize.mockRejectedValueOnce(new Error('refused'));
    show('AB12');
    await screen.findByText(/Wrong or expired code/);
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: 'Authorize' }));

    expect(await screen.findByText('Device connected')).toBeTruthy();
  });
});
