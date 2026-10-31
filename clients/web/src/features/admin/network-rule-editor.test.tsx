// @vitest-environment jsdom

import { KromaApiError } from '@kromatv/client';
import type { RulesUpdate } from '@kromatv/client/network';
import { ConfirmHost, KitProvider } from '@kromatv/ui/kit';
import { createInputTestHost, onScreen } from '@kromatv/ui/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RULES_VIEW } from '#web/features/admin/network.fixture';
import { RuleEditor } from '#web/features/admin/network-rule-editor';

const api = vi.hoisted(() => ({
  rules: vi.fn(),
  saveRules: vi.fn(),
  modules: vi.fn(),
}));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({
    client: {
      network: { rules: api.rules, saveRules: api.saveRules },
      modules: { list: api.modules },
    },
  }),
}));

function Providers({ children }: Readonly<{ children?: ReactNode }>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <KitProvider config={{ entry: { physicalKeyboard: true } }}>
        {onScreen(<ConfirmHost>{children}</ConfirmHost>)}
      </KitProvider>
    </QueryClientProvider>
  );
}

const { render, clearPressGuard } = createInputTestHost();

const press = (name: string) => {
  clearPressGuard();
  fireEvent.click(screen.getByRole('button', { name }));
};

const ids = (update: RulesUpdate) => update.rules.map((rule) => rule.id);

async function mount(onDirtyChange = vi.fn()) {
  render(<RuleEditor onDirtyChange={onDirtyChange} />, { wrapper: Providers });
  await screen.findByText('*.doubleclick.net');
  return onDirtyChange;
}

beforeEach(() => {
  api.rules.mockResolvedValue(structuredClone(RULES_VIEW));
  api.saveRules.mockResolvedValue(undefined);
  api.modules.mockResolvedValue([{ id: 'tv.kroma.torrents', name: 'Torrent downloads' }]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the rule editor', () => {
  it('names a module by the name its manifest gives', async () => {
    await mount();

    expect(await screen.findByText('Torrent downloads')).toBeTruthy();
  });

  it('holds the save back until something changes', async () => {
    await mount();

    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('saves the list in its new order after a rule moves down', async () => {
    await mount();

    press('Move rule 1 down');
    press('Save');

    await waitFor(() => expect(api.saveRules).toHaveBeenCalledTimes(1));
    expect(ids(api.saveRules.mock.calls[0]?.[0])).toEqual(['r-2', 'r-1']);
  });

  it('tells the page it holds unsaved edits', async () => {
    const onDirtyChange = await mount();

    press('Move rule 1 down');

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
  });

  it('shows why the server refused the list', async () => {
    api.saveRules.mockRejectedValue(
      new KromaApiError(400, 'PUT failed (400)', {
        error: 'A rule names a host that cannot exist.',
        code: 'error.networkRuleHost',
      }),
    );
    await mount();

    press('Move rule 1 down');
    press('Save');

    expect(await screen.findByText('A rule names a host that cannot exist.')).toBeTruthy();
  });

  it('replaces the list with a preset once the admin agrees', async () => {
    await mount();

    press('Presets');
    clearPressGuard();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Everything through the VPN' }));
    const dialog = await screen.findByRole('dialog');
    clearPressGuard();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Replace' }));
    await waitForElementToBeRemoved(() => screen.queryByText('*.doubleclick.net'));
    press('Save');

    await waitFor(() => expect(api.saveRules).toHaveBeenCalledTimes(1));
    expect(api.saveRules.mock.calls[0]?.[0]).toMatchObject({
      defaultAction: 'allow',
      rules: [{ caller: null, purpose: null, host: null, action: 'vpn' }],
    });
  });

  it('adds a rule written in the dialog at the end of the list', async () => {
    await mount();

    press('Add a rule');
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Host'), {
      target: { value: 'tracker.example' },
    });
    clearPressGuard();
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Add a rule' }).at(-1)!);
    press('Save');

    await waitFor(() => expect(api.saveRules).toHaveBeenCalledTimes(1));
    expect(ids(api.saveRules.mock.calls[0]?.[0])).toEqual(['r-1', 'r-2', 'r-3']);
  });
});
