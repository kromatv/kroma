// @vitest-environment jsdom

import { KitProvider } from '@kromatv/ui/kit';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const app = vi.hoisted(() => ({ user: { id: 'u1', kids: false } }));

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined }) }));
vi.mock('#mobile/lib/i18n', () => ({
  useT: () => (key: string) => key,
  useI18n: () => ({ locale: 'en' }),
}));
vi.mock('#mobile/lib/session', () => ({
  useSession: () => ({ serverUrl: 'https://kroma.local', user: app.user }),
  useClient: () => ({ query: { media: { health: () => ({}) } } }),
}));
vi.mock('#mobile/components/page-header.component', () => ({ PageHeader: () => null }));
vi.mock('#mobile/lib/layout', () => ({ boxed: () => ({}), contentWidth: { form: 560 } }));
vi.mock('#mobile/components/ui', () => ({
  Screen: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('#mobile/lib/build-info', () => ({
  buildInfo: { version: '1.0.0', branch: 'main', buildDate: null, repository: null },
  commitLabel: () => 'abc',
  repoLabel: () => null,
}));

const { default: Settings } = await import('./settings-screen.component');

const page = () => (
  <KitProvider config={{}}>
    <Settings />
  </KitProvider>
);

afterEach(() => {
  cleanup();
  app.user = { id: 'u1', kids: false };
});

describe('the settings screen', () => {
  it('leads to the notification choices', () => {
    render(page());

    expect(screen.getByText('notifications.settings')).toBeTruthy();
  });

  it('keeps the notification choices from a Kids session, which the server refuses it', () => {
    app.user = { id: 'kid', kids: true };

    render(page());

    expect(screen.queryByText('notifications.settings')).toBeNull();
    expect(screen.getByText('account.uiLanguage')).toBeTruthy();
  });
});
