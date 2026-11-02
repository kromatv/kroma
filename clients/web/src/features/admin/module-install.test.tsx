// @vitest-environment jsdom
import { createQueryClient } from '@kromatv/client/query';
import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { InstallModal } from '#web/features/admin/module-install';
import { createWebRuntime } from '#web/shared/lib/api';
import { WebRuntimeProvider } from '#web/shared/lib/web-runtime';

const { render } = createInputTestHost();

afterEach(cleanup);

it('asks the server for the install plan as soon as the dialog opens', async () => {
  const runtime = createWebRuntime({
    client: createQueryClient({ baseUrl: 'http://kroma.test', authToken: 't' }),
  });
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queries}>
      <I18nProvider locale="en">
        <WebRuntimeProvider value={runtime}>
          <InstallModal />
        </WebRuntimeProvider>
      </I18nProvider>
    </QueryClientProvider>,
  );

  const plan = vi
    .spyOn(runtime.moduleApi, 'fetchInstallPlan')
    .mockReturnValue(new Promise(() => {}));

  act(() => {
    void InstallModal.call({ id: 'tv.kroma.torrents' });
  });

  await waitFor(() => expect(plan).toHaveBeenCalledWith('tv.kroma.torrents', []));
});
