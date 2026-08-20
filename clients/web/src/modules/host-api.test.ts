// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  answers,
  auth,
  base,
  createEventBus,
  fetchMock,
  hasPermission,
  installHarness,
  loadRuntimeRemotes,
  locale,
  navigate,
  registry,
  sessionToken,
  t,
} from '#web/modules/host.fixture';

vi.mock('@kroma/core', () => ({ sessionToken, hasPermission }));
vi.mock('@kroma/module-sdk', () => ({ createEventBus }));
vi.mock('@kroma/ui', () => ({
  useT: () => t,
  useLocale: () => locale.value,
}));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));
vi.mock('#web/modules/registry', () => ({ moduleRegistry: registry }));
vi.mock('#web/modules/remotes', () => ({ loadRuntimeRemotes }));
vi.mock('#web/shared/lib/api', () => ({ apiBase: () => 'https://kroma.test' }));
vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => auth }));

import { useModuleHost } from './host';

installHarness();

describe('the api the host grants', () => {
  it('carries the session bearer', async () => {
    renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());

    answers({ ok: true });
    await base().api.get('/torrents');
    expect(fetchMock).toHaveBeenLastCalledWith('https://kroma.test/api/torrents', {
      headers: { Authorization: 'Bearer tok' },
    });
  });

  it('sends no Authorization header when there is no token', async () => {
    renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());

    sessionToken.mockReturnValue(null);
    answers({ ok: true });
    await base().api.get('/torrents');
    expect(fetchMock).toHaveBeenLastCalledWith('https://kroma.test/api/torrents', { headers: {} });
  });

  it('throws with the path and status when the server refuses', async () => {
    renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());

    answers(null, false, 503);
    await expect(base().api.get('/torrents')).rejects.toThrow(/\/api\/torrents.*503/);
  });

  it('lists the backend modules from the one endpoint', async () => {
    renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());

    answers([{ id: 'vpn' }]);
    await expect(base().api.listModules()).resolves.toEqual([{ id: 'vpn' }]);
    expect(fetchMock).toHaveBeenLastCalledWith('https://kroma.test/api/modules', expect.anything());
  });
});

describe('what the host reads through the ref', () => {
  it('reports the CURRENT user, not the one at build time', async () => {
    const { rerender } = renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());
    expect(base().auth.userId).toBe('u1');

    auth.user = { id: 'u2' };
    rerender();
    await waitFor(() => expect(base().auth.userId).toBe('u2'));
  });

  it('reports no user when signed out', async () => {
    const { rerender } = renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());

    auth.user = null;
    rerender();
    await waitFor(() => expect(base().auth.userId).toBeNull());
  });

  it('answers a capability against the current account', async () => {
    renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());

    hasPermission.mockReturnValue(true);
    expect(base().auth.can('torrents:read')).toBe(true);
    hasPermission.mockReturnValue(false);
    expect(base().auth.can('torrents:read')).toBe(false);
  });

  it('refuses every capability when there is nobody signed in', async () => {
    const { rerender } = renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());

    auth.user = null;
    rerender();
    hasPermission.mockReturnValue(true);
    await waitFor(() => expect(base().auth.can('torrents:read')).toBe(false));
  });

  it('translates through the app’s own translator, vars and all', async () => {
    renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());

    expect(base().i18n.t('torrents.count', { n: 3 })).toBe('t:torrents.count:{"n":3}');
  });

  it('reports the CURRENT locale', async () => {
    const { rerender } = renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());
    expect(base().i18n.locale).toBe('en');

    locale.value = 'fr';
    rerender();
    await waitFor(() => expect(base().i18n.locale).toBe('fr'));
  });

  it('navigates by plain string path', async () => {
    renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());

    base().nav.navigate('/modules/torrents');
    expect(navigate).toHaveBeenCalledWith({ to: '/modules/torrents' });
  });
});
