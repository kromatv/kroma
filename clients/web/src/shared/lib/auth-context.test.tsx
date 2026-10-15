// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { AuthContext, type AuthValue, useAuth } from './auth-context';

const SIGNED_IN = { user: { id: 'u1' }, ready: true } as unknown as AuthValue;

const provider = (value: AuthValue) => (props: { children: ReactNode }) => (
  <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>
);

describe('useAuth', () => {
  it('hands the session over inside the provider', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: provider(SIGNED_IN) });

    expect(result.current).toBe(SIGNED_IN);
  });

  it('refuses to read a session outside the provider rather than inventing one', () => {
    expect(() => renderHook(() => useAuth())).toThrow(/within <AuthProvider>/);
  });
});
