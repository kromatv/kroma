// @vitest-environment jsdom

// Which engine add-flows the admin console offers. A module with no add-flow
// (the always-on embedded `rqbit` provides a capability but has nothing to
// add) is not offered, and `enabled` defaults to true while the module list
// is still loading, so add-flows don't blink off on every page load.

import type { EngineCapability, EngineField, ModuleInfo } from '@kroma/core';
import { I18nProvider } from '@kroma/ui';
import { clearPressGuard, setEntryDefaults } from '@kroma/ui/kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminHostProvider } from './context';
import {
  AddEngineHost,
  type AddEngineOptions,
  addEngine,
  useEnabledEngines,
  useModuleEnabled,
} from './engines';

// A provider whose `client.modules()` answers `modules`; retries off so a
// rejected fetch settles once instead of backing off through the test.
function wrapper(modules: ModuleInfo[] | (() => Promise<ModuleInfo[]>)) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const client = {
    modules: typeof modules === 'function' ? modules : vi.fn(async () => modules),
  };
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AdminHostProvider value={{ client, user: null, apiBase: '' } as never}>
        {children}
      </AdminHostProvider>
    </QueryClientProvider>
  );
}

const mod = (over: Partial<ModuleInfo> & { id: string }): ModuleInfo =>
  ({ enabled: true, provides: [], ...over }) as ModuleInfo;

const cap = (kind: string, over: Record<string, unknown> = {}) =>
  ({ kind, fields: [{ key: 'url', label: 'field.url', type: 'text' }], ...over }) as never;

describe('useEnabledEngines', () => {
  it('offers an enabled module that provides the kind', async () => {
    const { result } = renderHook(() => useEnabledEngines('download-client'), {
      wrapper: wrapper([mod({ id: 'transmission', provides: [cap('download-client')] })]),
    });
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]?.kind).toBe('download-client');
  });

  it('drops a disabled module, so its add-flow disappears from the page', async () => {
    const { result } = renderHook(() => useEnabledEngines('download-client'), {
      wrapper: wrapper([
        mod({ id: 'off', enabled: false, provides: [cap('download-client')] }),
        mod({ id: 'on', provides: [cap('download-client')] }),
      ]),
    });
    await waitFor(() => expect(result.current).toHaveLength(1));
  });

  it('ignores capabilities of a different kind', async () => {
    const { result } = renderHook(() => useEnabledEngines('indexer-engine'), {
      wrapper: wrapper([mod({ id: 'a', provides: [cap('download-client')] })]),
    });
    await waitFor(() => expect(result.current).toHaveLength(0));
  });

  it('skips a capability with nothing to add', async () => {
    const { result } = renderHook(() => useEnabledEngines('download-client'), {
      wrapper: wrapper([
        // The embedded always-on engine: it PROVIDES the capability but has no
        // form and no flow, so an add-picker entry would open an empty modal.
        mod({ id: 'rqbit', provides: [cap('download-client', { fields: [] })] }),
      ]),
    });
    await waitFor(() => expect(result.current).toHaveLength(0));
  });

  it('accepts a custom flow in place of a field form', async () => {
    const { result } = renderHook(() => useEnabledEngines('indexer-engine'), {
      wrapper: wrapper([
        // The Cardigann definition picker has no `fields` - its whole add-flow
        // is bespoke - and must still be offered.
        mod({
          id: 'cardigann',
          provides: [cap('indexer-engine', { fields: [], flow: 'cardigann' })],
        }),
      ]),
    });
    await waitFor(() => expect(result.current).toHaveLength(1));
  });

  it('gathers every provider of the kind across modules', async () => {
    const { result } = renderHook(() => useEnabledEngines('download-client'), {
      wrapper: wrapper([
        mod({ id: 'a', provides: [cap('download-client')] }),
        mod({ id: 'b', provides: [cap('download-client'), cap('indexer-engine')] }),
      ]),
    });
    await waitFor(() => expect(result.current).toHaveLength(2));
  });

  it('is empty rather than throwing before the module list arrives', () => {
    const never = () => new Promise<ModuleInfo[]>(() => {});
    const { result } = renderHook(() => useEnabledEngines('download-client'), {
      wrapper: wrapper(never),
    });
    expect(result.current).toEqual([]);
  });
});

describe('useModuleEnabled', () => {
  it('reports a module that is on', async () => {
    const { result } = renderHook(() => useModuleEnabled('torrents'), {
      wrapper: wrapper([mod({ id: 'torrents' })]),
    });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('reports a module that is off', async () => {
    const { result } = renderHook(() => useModuleEnabled('torrents'), {
      wrapper: wrapper([mod({ id: 'torrents', enabled: false })]),
    });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('assumes enabled while the list is still loading', () => {
    const never = () => new Promise<ModuleInfo[]>(() => {});
    const { result } = renderHook(() => useModuleEnabled('torrents'), {
      wrapper: wrapper(never),
    });
    // Defaulting to false here would blink every gated feature off on each page
    // load, which reads as the feature having been removed.
    expect(result.current).toBe(true);
  });

  it('assumes enabled for a module it has never heard of', async () => {
    const { result } = renderHook(() => useModuleEnabled('unknown'), {
      wrapper: wrapper([mod({ id: 'torrents' })]),
    });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('treats a module with no explicit flag as enabled', async () => {
    const { result } = renderHook(() => useModuleEnabled('torrents'), {
      wrapper: wrapper([{ id: 'torrents', provides: [] } as never]),
    });
    await waitFor(() => expect(result.current).toBe(true));
  });
});

// jsdom types on a real keyboard, so the kit entries render real inputs.
setEntryDefaults({ physicalKeyboard: true });

afterEach(() => {
  cleanup();
  clearPressGuard();
});

const field = (over: Partial<EngineField> & { key: string }): EngineField => ({
  label: 'field.url',
  type: 'string',
  ...over,
});

const capability = (id: string, fields: EngineField[] = []): EngineCapability => ({
  kind: 'download-client',
  id,
  label: id,
  fields,
});

function open(options: AddEngineOptions): Promise<boolean> {
  render(
    <I18nProvider locale="en">
      <AddEngineHost />
    </I18nProvider>,
  );
  let answer!: Promise<boolean>;
  act(() => {
    answer = addEngine(options);
  });
  // The panel arms the press guard as it mounts, and would otherwise swallow
  // the test's first press.
  clearPressGuard();
  return answer;
}

const entry = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const fill = (name: string, value: string) => fireEvent.change(entry(name), { target: { value } });

// The panel re-arms the press guard on every render, so a press that follows a
// keystroke has to clear it first.
function click(el: HTMLElement) {
  clearPressGuard();
  fireEvent.click(el);
}

const save = () => click(screen.getByLabelText('Save'));

describe('addEngine', () => {
  it('answers no when there is no host mounted to draw it', async () => {
    await expect(
      addEngine({ engines: [capability('transmission')], title: 'Add', onSubmit: vi.fn() }),
    ).resolves.toBe(false);
  });

  it('hands back the engine, the name and every field that was filled in', async () => {
    const onSubmit = vi.fn(async () => {});
    const answer = open({
      title: 'Add a download client',
      engines: [
        capability('transmission', [
          field({ key: 'url', required: true }),
          field({ key: 'password', label: 'field.password', secret: true }),
        ]),
      ],
      onSubmit,
    });

    fill('Name', 'Salon');
    fill('URL', 'http://nas:9091');
    fill('Password', 'hunter2');
    save();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith('transmission', {
        name: 'Salon',
        url: 'http://nas:9091',
        password: 'hunter2',
      }),
    );
    await expect(answer).resolves.toBe(true);
  });

  it('holds Save until the name and every required field are there', () => {
    open({
      title: 'Add a download client',
      engines: [capability('transmission', [field({ key: 'url', required: true })])],
      onSubmit: vi.fn(),
    });

    expect(screen.getByLabelText('Save').getAttribute('aria-disabled')).toBe('true');
    fill('Name', 'Salon');
    expect(screen.getByLabelText('Save').getAttribute('aria-disabled')).toBe('true');
    fill('URL', 'http://nas:9091');
    expect(screen.getByLabelText('Save').getAttribute('aria-disabled')).toBeNull();
  });

  it('submits a select field as the option that was picked', async () => {
    const onSubmit = vi.fn(async () => {});
    open({
      title: 'Add an indexer',
      engines: [
        capability('cardigann', [
          field({
            key: 'category',
            label: 'field.categories',
            type: 'select',
            options: ['movies', 'tv'],
          }),
        ]),
      ],
      onSubmit,
    });

    click(screen.getByRole('combobox'));
    expect(screen.getAllByRole('option').map((row) => row.textContent)).toEqual(['movies', 'tv']);
    click(screen.getAllByRole('option')[1] as HTMLElement);

    fill('Name', 'Nyaa');
    save();
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith('cardigann', { name: 'Nyaa', category: 'tv' }),
    );
  });

  // Fields typed for one engine must not ride along in the other's submit, and
  // switching back must not lose what was typed.
  it('keeps each engine’s draft to itself', async () => {
    const onSubmit = vi.fn(async () => {});
    open({
      title: 'Add a download client',
      engines: [
        capability('transmission', [field({ key: 'url' })]),
        capability('qbittorrent', [field({ key: 'url' })]),
      ],
      onSubmit,
    });

    fill('Name', 'Salon');
    fill('URL', 'http://transmission:9091');
    click(screen.getByRole('radio', { name: 'qbittorrent' }));
    expect(entry('URL').value).toBe('');
    fill('URL', 'http://qbit:8080');

    click(screen.getByRole('radio', { name: 'transmission' }));
    expect(entry('URL').value).toBe('http://transmission:9091');

    click(screen.getByRole('radio', { name: 'qbittorrent' }));
    save();
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith('qbittorrent', {
        name: 'Salon',
        url: 'http://qbit:8080',
      }),
    );
  });

  it('says why the server refused, and leaves the panel open', async () => {
    open({
      title: 'Add a download client',
      engines: [capability('transmission')],
      onSubmit: vi.fn(async () => {
        throw new Error('unreachable');
      }),
    });

    fill('Name', 'Salon');
    save();

    expect(await screen.findByText('Action failed')).toBeTruthy();
    expect(screen.getByText('Add a download client')).toBeTruthy();
  });

  it('answers no when the panel is dismissed', async () => {
    const answer = open({
      title: 'Add a download client',
      engines: [capability('transmission')],
      onSubmit: vi.fn(),
    });

    click(screen.getByLabelText('Cancel'));
    await expect(answer).resolves.toBe(false);
  });

  it('answers no when the panel is closed on Back', async () => {
    const answer = open({
      title: 'Add a download client',
      engines: [capability('transmission')],
      onSubmit: vi.fn(),
    });

    fireEvent.keyDown(window, { key: 'Escape' });
    await expect(answer).resolves.toBe(false);
  });

  it('draws one ask at a time, in the order they arrived', async () => {
    const first = open({
      title: 'Add a download client',
      engines: [capability('transmission')],
      onSubmit: vi.fn(),
    });
    let second!: Promise<boolean>;
    act(() => {
      second = addEngine({
        title: 'Add an indexer',
        engines: [capability('cardigann')],
        onSubmit: vi.fn(),
      });
    });
    expect(screen.queryByText('Add an indexer')).toBeNull();

    click(screen.getByLabelText('Cancel'));
    await expect(first).resolves.toBe(false);
    expect(screen.getByText('Add an indexer')).toBeTruthy();

    click(screen.getByLabelText('Cancel'));
    await expect(second).resolves.toBe(false);
  });
});
