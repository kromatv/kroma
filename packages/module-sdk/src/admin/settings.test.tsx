// @vitest-environment jsdom

// The generic settings renderer behind every admin settings page and the VPN
// / Acquisition module pages. It writes optimistically: a row shows the new
// value immediately, and a failed PUT does not take the page down.

import type { SettingGroup } from '@kroma/core';
import { I18nProvider } from '@kroma/ui';
import { setEntryDefaults } from '@kroma/ui/kit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminHostProvider } from './context';
import { SettingsView } from './settings';

const group = (rows: Partial<SettingGroup['rows'][number]>[]): SettingGroup =>
  ({
    title: 'General',
    rows: rows.map((r, i) => ({
      key: `k${i}`,
      label: `Row ${i}`,
      kind: 'value',
      value: '',
      applied: true,
      ...r,
    })),
  }) as SettingGroup;

function mount(
  groups: SettingGroup[],
  {
    perms = ['settings.manage'],
    over = {},
  }: { perms?: string[]; over?: Record<string, unknown> } = {},
) {
  const client = {
    adminSettings: vi.fn(async () => ({ groups })),
    updateSettings: vi.fn(async () => undefined),
    ...over,
  };
  const wrap = ({ children }: { children: ReactNode }) => (
    <I18nProvider locale="en">
      <AdminHostProvider value={{ client, user: { permissions: perms } } as never}>
        {children}
      </AdminHostProvider>
    </I18nProvider>
  );
  const view = render(
    <SettingsView
      view="general"
      titleKey={'admin.serverSettings' as never}
      subtitleKey={'admin.serverSettings' as never}
    />,
    { wrapper: wrap },
  );
  return { ...view, client };
}

// jsdom types on a real keyboard, so the kit entries render real inputs.
setEntryDefaults({ physicalKeyboard: true });

// react-native-web's press responder fires on the keyUp that follows a keyDown,
// so a keyboard press is both halves.
function press(el: HTMLElement) {
  el.focus();
  fireEvent.keyDown(el, { key: 'Enter' });
  fireEvent.keyUp(el, { key: 'Enter' });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('access', () => {
  // The server enforces it too; denying here avoids rendering a page whose
  // every call would 403.
  it('denies the page without settings.manage', () => {
    const { client } = mount([group([{}])], { perms: ['playback'] });
    expect(client.adminSettings).not.toHaveBeenCalled();
  });

  it('renders for a settings manager', async () => {
    const { container } = mount([group([{ label: 'Server name' }])]);
    await waitFor(() => expect(container.textContent).toContain('Server name'));
  });
});

describe('rendering', () => {
  it('shows each group and its description', async () => {
    const { container } = mount([
      { ...group([{}]), title: 'Network', desc: 'How the server is reached' },
    ]);
    await waitFor(() => expect(container.textContent).toContain('Network'));
    expect(container.textContent).toContain('How the server is reached');
  });

  it('draws a toggle for a boolean row', async () => {
    const { container } = mount([group([{ kind: 'toggle', value: true, label: 'Enable scan' }])]);
    await waitFor(() => expect(container.textContent).toContain('Enable scan'));
  });

  // A setting the server took but has not applied yet says so, rather than
  // looking identical to one that is live.
  it('marks a row that is stored but not yet applied', async () => {
    const { container } = mount([group([{ kind: 'toggle', value: true, applied: false }])]);
    await waitFor(() => expect(container.textContent).toContain('Row 0'));
    expect(container.textContent).toContain('preference saved');
  });

  it('does not mark a plain value row, which has nothing to apply', async () => {
    const { container } = mount([group([{ kind: 'value', applied: false }])]);
    await waitFor(() => expect(container.textContent).toContain('Row 0'));
    expect(container.textContent).not.toContain('preference saved');
  });

  it('prints a value row that is not a string', async () => {
    const { container } = mount([
      group([
        { kind: 'value', value: 4040, label: 'Port' },
        { kind: 'value', value: { host: 'nas' }, label: 'Peer' },
        { kind: 'value', value: null, label: 'Nothing' },
      ]),
    ]);
    await waitFor(() => expect(container.textContent).toContain('Port'));
    expect(container.textContent).toContain('4040');
    // An object would otherwise read as "[object Object]".
    expect(container.textContent).toContain('{"host":"nas"}');
  });

  it('asks the server for the view it was given', async () => {
    const { client } = mount([]);
    await waitFor(() => expect(client.adminSettings).toHaveBeenCalledWith('general'));
  });

  // Embedded under another page (the VPN card), the header would be a second
  // title on the same screen.
  it('omits the header when embedded', async () => {
    const client = {
      adminSettings: vi.fn(async () => ({ groups: [group([{}])] })),
      updateSettings: vi.fn(async () => undefined),
    };
    const { container } = render(
      <I18nProvider locale="en">
        <AdminHostProvider value={{ client, user: { permissions: ['settings.manage'] } } as never}>
          <SettingsView
            view="vpn"
            titleKey={'admin.settings' as never}
            subtitleKey={'admin.settings' as never}
            embedded
          />
        </AdminHostProvider>
      </I18nProvider>,
    );
    await waitFor(() => expect(container.textContent).toContain('Row 0'));
    expect(container.textContent).not.toContain('Saved');
  });
});

// A `secret` row holds an APNs signing key or a Firebase service account. The
// server never sends one back, so the two things that must hold are that a
// pasted key does not survive in the page, and that walking past the field
// cannot erase a working one.
describe('secret rows', () => {
  const secret = (configured: boolean) =>
    group([{ kind: 'secret', value: '', configured, label: 'Auth key' }]);

  const field = (container: HTMLElement) =>
    container.querySelector('textarea') as HTMLTextAreaElement;

  it('says whether a key is stored, without showing it', async () => {
    const { container } = mount([secret(true)]);
    await waitFor(() => expect(container.textContent).toContain('Auth key'));
    expect(container.textContent).toContain('Configured');
    expect(field(container).value).toBe('');
  });

  it('reports an unset key rather than looking the same as a set one', async () => {
    const { container } = mount([secret(false)]);
    await waitFor(() => expect(container.textContent).toContain('Auth key'));
    expect(container.textContent).toContain('Not set');
  });

  it('sends a pasted key once, then forgets it', async () => {
    const { container, client } = mount([secret(false)]);
    await waitFor(() => expect(container.textContent).toContain('Auth key'));
    const input = field(container);
    fireEvent.change(input, { target: { value: '-----BEGIN PRIVATE KEY-----' } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(client.updateSettings).toHaveBeenCalledWith({ k0: '-----BEGIN PRIVATE KEY-----' }),
    );
    // Not left in the textarea, and not written back into the row's value by the
    // optimistic update either.
    expect(field(container).value).toBe('');
    expect(container.textContent).not.toContain('BEGIN PRIVATE KEY');
    expect(container.textContent).toContain('Configured');
  });

  // The whole reason blur does not commit blindly: tabbing through the form
  // would otherwise silently turn iOS push off.
  it('does not erase a stored key when the field is left empty', async () => {
    const { container, client } = mount([secret(true)]);
    await waitFor(() => expect(container.textContent).toContain('Auth key'));
    fireEvent.blur(field(container));
    fireEvent.change(field(container), { target: { value: '   ' } });
    fireEvent.blur(field(container));
    expect(client.updateSettings).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Configured');
  });

  // ...which means removing one has to be deliberate.
  it('clears a stored key on an explicit request', async () => {
    const { container, client } = mount([secret(true)]);
    await waitFor(() => expect(container.textContent).toContain('Auth key'));
    const clear = [...container.querySelectorAll('[role="button"]')].find((b) =>
      b.textContent?.includes('Clear'),
    );
    fireEvent.click(clear as HTMLElement);
    await waitFor(() => expect(client.updateSettings).toHaveBeenCalledWith({ k0: '' }));
    expect(container.textContent).toContain('Not set');
  });
});

describe('select rows', () => {
  const language = (options: string[], value = 'fr') =>
    group([{ kind: 'select', value, options, label: 'Language' }]);

  it('saves the option that was picked', async () => {
    const { container, client } = mount([language(['fr', 'en'])]);
    await waitFor(() => expect(container.textContent).toContain('Language'));

    press(screen.getByRole('combobox'));
    fireEvent.click(screen.getAllByRole('option')[1] as HTMLElement);
    await waitFor(() => expect(client.updateSettings).toHaveBeenCalledWith({ k0: 'en' }));
  });

  // A stored setting the schema no longer names would otherwise fall to the
  // placeholder, reading as a setting nobody ever made.
  it('keeps a stored value the list no longer offers', async () => {
    const { container } = mount([language(['fr', 'en'], 'sv')]);
    await waitFor(() => expect(container.textContent).toContain('Language'));

    press(screen.getByRole('combobox'));
    expect(screen.getAllByRole('option').map((row) => row.textContent)).toEqual(['sv', 'fr', 'en']);
  });
});

describe('text rows', () => {
  const name = group([{ kind: 'text', value: 'kroma', label: 'Server name' }]);

  const field = (container: HTMLElement) => container.querySelector('input') as HTMLInputElement;

  it('commits what was typed when the field is left', async () => {
    const { container, client } = mount([name]);
    await waitFor(() => expect(container.textContent).toContain('Server name'));

    fireEvent.change(field(container), { target: { value: 'salon' } });
    fireEvent.blur(field(container));
    await waitFor(() => expect(client.updateSettings).toHaveBeenCalledWith({ k0: 'salon' }));
  });

  it('says nothing when the field is left as it was found', async () => {
    const { container, client } = mount([name]);
    await waitFor(() => expect(container.textContent).toContain('Server name'));

    fireEvent.blur(field(container));
    expect(client.updateSettings).not.toHaveBeenCalled();
  });
});

describe('failures', () => {
  it('keeps the page up when a save is refused', async () => {
    const { container, client } = mount(
      [group([{ kind: 'toggle', value: false, label: 'Scan' }])],
      {
        over: {
          updateSettings: vi.fn(async () => {
            throw new Error('offline');
          }),
        },
      },
    );
    await waitFor(() => expect(container.textContent).toContain('Scan'));

    fireEvent.click(screen.getByRole('switch', { name: 'Scan' }));
    await waitFor(() => expect(client.updateSettings).toHaveBeenCalledWith({ k0: true }));
    expect(container.textContent).toContain('Scan');
  });

  it('renders an empty page when the fetch fails rather than throwing', async () => {
    const { container } = mount([], {
      over: {
        adminSettings: vi.fn(async () => {
          throw new Error('offline');
        }),
      },
    });
    await waitFor(() => expect(container).toBeTruthy());
    expect(container.textContent).not.toContain('Row 0');
  });
});
