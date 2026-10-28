// @vitest-environment jsdom
import type { StoreRegistry } from '@kromatv/client/modules';
import { createQueryClient } from '@kromatv/client/query';
import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RegistriesDrawer } from '#web/features/admin/module-registries';
import { createWebRuntime, type WebRuntime } from '#web/shared/lib/api';
import { WebRuntimeProvider } from '#web/shared/lib/web-runtime';

const { clearPressGuard, render } = createInputTestHost();

afterEach(cleanup);

function registry(name: string, official: boolean): StoreRegistry {
  return {
    name,
    url: `https://${name}.test/index.json`,
    official,
    enabled: true,
    moduleCount: 0,
    shadowed: [],
  };
}

function runtimeListing(registries: StoreRegistry[]): WebRuntime {
  const runtime = createWebRuntime({
    client: createQueryClient({ baseUrl: 'http://kroma.test', authToken: 't' }),
  });
  vi.spyOn(runtime.moduleApi, 'fetchStoreCatalog').mockResolvedValue({
    schema: 1,
    serverVersion: '0.1.39',
    target: 'x86_64-unknown-linux-musl',
    registryUrl: registries[0]?.url ?? '',
    registries,
    modules: [],
  });
  return runtime;
}

async function openDrawer(runtime: WebRuntime): Promise<HTMLElement> {
  render(
    <I18nProvider locale="en">
      <QueryClientProvider client={runtime.queryClient}>
        <WebRuntimeProvider value={runtime}>
          <RegistriesDrawer />
        </WebRuntimeProvider>
      </QueryClientProvider>
    </I18nProvider>,
  );
  act(() => {
    void RegistriesDrawer.call({});
  });
  const remove = await screen.findByRole('button', { name: 'Remove' });
  clearPressGuard();
  return remove;
}

it('saves the registry list without the one the admin removed', async () => {
  const runtime = runtimeListing([registry('official', true), registry('community', false)]);
  const remove = await openDrawer(runtime);

  const save = vi.spyOn(runtime.moduleApi, 'adminApi').mockResolvedValue(undefined);

  fireEvent.click(remove);

  await waitFor(() =>
    expect(save).toHaveBeenCalledWith('/settings', {
      method: 'PUT',
      body: JSON.stringify({ moduleRegistries: [] }),
    }),
  );
});
