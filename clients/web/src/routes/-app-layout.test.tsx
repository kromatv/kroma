// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hold = vi.hoisted(() => ({ ready: true, authed: true, step: 'lg' }));

vi.mock('@kromatv/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kromatv/ui')>()),
  CastProvider: ({ children }: { children: ReactNode }) => <div data-testid="cast">{children}</div>,
}));
vi.mock('@kromatv/ui/kit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kromatv/ui/kit')>()),
  useBreakpoint: () => hold.step,
}));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Outlet: () => <div>page</div>,
}));
vi.mock('#web/features/catalog/sidebar.component', () => ({
  Sidebar: () => <div>rail</div>,
  MobileTopbar: () => <div>topbar</div>,
}));
vi.mock('#web/features/catalog/modal-hosts.component', () => ({ CatalogModalHosts: () => null }));
vi.mock('#web/features/notifications/use-notifications', () => ({
  useNotificationStream: () => undefined,
}));
vi.mock('#web/features/playback/cast/cast-bar.component', () => ({
  CastBar: ({ inset }: { inset: number }) => <div data-testid="bar" data-inset={inset} />,
}));
vi.mock('#web/shared/lib/require-auth.hook', () => ({
  useRequireAuth: () => ({ ready: hold.ready, authed: hold.authed }),
}));
vi.mock('#web/shared/lib/web-runtime', () => ({ useWebRuntime: () => ({ client: {} }) }));
vi.mock('#web/shared/ui/cast-picker.component', () => ({ CastPicker: () => null }));
vi.mock('#web/shared/ui/direct-offer.component', () => ({ DirectOffer: () => null }));

import { Route } from './_app';

function layout() {
  const Layout = Route.options.component;
  if (!Layout) {
    throw new Error('the app route has a layout');
  }
  return render(<Layout />);
}

beforeEach(() => {
  hold.ready = true;
  hold.authed = true;
  hold.step = 'lg';
});
afterEach(cleanup);

describe('the app layout', () => {
  it('renders nothing before the session is ready', () => {
    hold.ready = false;

    const { container } = layout();

    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for a signed-out visitor', () => {
    hold.authed = false;

    const { container } = layout();

    expect(container.innerHTML).toBe('');
  });

  it('puts the rail beside the page on a wide screen and keeps the bar clear of it', () => {
    layout();

    expect(screen.getByText('rail')).toBeTruthy();
    expect(screen.queryByText('topbar')).toBeNull();
    expect(screen.getByTestId('bar').getAttribute('data-inset')).toBe('248');
  });

  it('puts a top bar above the page on a narrow screen', () => {
    hold.step = 'base';

    layout();

    expect(screen.getByText('topbar')).toBeTruthy();
    expect(screen.queryByText('rail')).toBeNull();
    expect(screen.getByTestId('bar').getAttribute('data-inset')).toBe('0');
  });
});
