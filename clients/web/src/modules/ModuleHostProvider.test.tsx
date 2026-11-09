// @vitest-environment jsdom
import { Text } from '@kromatv/ui/kit';
import { onScreen } from '@kromatv/ui/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  list: vi.fn(() => new Promise<never>(() => {})),
}));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, client: { modules: { list: H.list } } }),
}));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));

import { ModuleHostProvider, useModuleNavAll } from './ModuleHostProvider';

afterEach(cleanup);

function ModuleLinks() {
  return <Text>{`${useModuleNavAll().length} module links`}</Text>;
}

it('paints a core page while the module list has not answered', () => {
  render(
    onScreen(
      <QueryClientProvider client={new QueryClient()}>
        <ModuleHostProvider>
          <Text>the home page</Text>
          <ModuleLinks />
        </ModuleHostProvider>
      </QueryClientProvider>,
    ),
  );

  expect(screen.getByText('the home page')).toBeTruthy();
  expect(screen.getByText('0 module links')).toBeTruthy();
  expect(H.list).toHaveBeenCalled();
});
