// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const auth = { user: { language: 'fr' }, client: null, updateUser: vi.fn() };
vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => auth }));

const { LocaleProvider } = await import('#web/shared/lib/locale');

function mount(client: QueryClient, children: ReactNode) {
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider>{children}</LocaleProvider>
    </QueryClientProvider>,
  );
}

describe('LocaleProvider', () => {
  it('does not throw away the first paint on mount', () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    mount(client, null);

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('refetches when the account language changes, so cached answers are not left in the old one', () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { rerender } = mount(client, null);

    auth.user = { language: 'en' };
    rerender(
      <QueryClientProvider client={client}>
        <LocaleProvider>{null}</LocaleProvider>
      </QueryClientProvider>,
    );

    expect(invalidate).toHaveBeenCalled();
  });
});
