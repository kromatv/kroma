// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ user: null as { id: string } | null, ready: false }));
vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => auth }));

const navigate = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ href: '/library' }));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { href: router.href } }),
}));

import { useRequireAuth } from './require-auth';

function guard(href = '/library') {
  router.href = href;
  return renderHook(() => useRequireAuth());
}

beforeEach(() => {
  auth.user = null;
  auth.ready = false;
  router.href = '/library';
  vi.clearAllMocks();
});

describe('while the session is still hydrating', () => {
  it('does not redirect', () => {
    auth.ready = false;
    guard();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('reports not-ready so the layout can hold a loader', () => {
    auth.ready = false;
    const { result } = guard();
    expect(result.current).toEqual({ ready: false, authed: false });
  });

  it('does not redirect while hydrating even with a user already known', () => {
    auth.ready = false;
    auth.user = { id: 'u1' };
    guard();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('once the session has resolved', () => {
  it('lets a signed-in visitor through', () => {
    auth.ready = true;
    auth.user = { id: 'u1' };
    const { result } = guard();
    expect(navigate).not.toHaveBeenCalled();
    expect(result.current).toEqual({ ready: true, authed: true });
  });

  it('sends a signed-out visitor to the login page', () => {
    auth.ready = true;
    guard('/library');
    expect(navigate).toHaveBeenCalledWith({
      to: '/login',
      search: { redirect: '/library' },
      replace: true,
    });
  });

  it('remembers where they were going, query string and all', () => {
    auth.ready = true;
    guard('/browse/films?sort=added&genre=Drama');
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: { redirect: '/browse/films?sort=added&genre=Drama' } }),
    );
  });

  it('REPLACES rather than pushes', () => {
    auth.ready = true;
    guard();
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ replace: true }));
  });

  it('reports authed:false while the redirect settles', () => {
    auth.ready = true;
    const { result } = guard();
    expect(result.current).toEqual({ ready: true, authed: false });
  });
});

describe('once it has arrived at the login page', () => {
  it('stands down instead of nesting the url into itself', () => {
    auth.ready = true;
    guard('/login?redirect=/library');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('stands down on the bare login page too', () => {
    auth.ready = true;
    guard('/login');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('redirects only ONCE on the way there', () => {
    auth.ready = true;
    const { rerender } = guard('/library');
    expect(navigate).toHaveBeenCalledOnce();

    router.href = '/login?redirect=/library';
    rerender();
    expect(navigate).toHaveBeenCalledOnce();
  });

  it('still guards a route that merely BEGINS like a word for login', () => {
    auth.ready = true;
    guard('/library/logins');
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: { redirect: '/library/logins' } }),
    );
  });
});
