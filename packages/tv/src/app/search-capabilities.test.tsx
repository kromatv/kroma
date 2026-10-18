// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { type SearchShell, SearchShellProvider, useSearchShell } from './searchShell';
import { useVoiceSearchBackend, type VoiceSearchBackend, VoiceSearchProvider } from './voiceSearch';

afterEach(cleanup);

function scope(voice: VoiceSearchBackend, shell: SearchShell) {
  return function Provider({ children }: { children: ReactNode }) {
    return (
      <VoiceSearchProvider value={voice}>
        <SearchShellProvider value={shell}>{children}</SearchShellProvider>
      </VoiceSearchProvider>
    );
  };
}

const useCapabilities = () => ({ voice: useVoiceSearchBackend(), shell: useSearchShell() });
const backend = () => ({ available: () => true, Session: () => null });
const chrome = () => ({ available: () => true, Shell: () => null });

describe('app-owned search capabilities', () => {
  it('keeps two app roots independent, including when one unmounts', () => {
    const a = { voice: backend(), shell: chrome() };
    const b = { voice: backend(), shell: chrome() };
    const first = renderHook(useCapabilities, { wrapper: scope(a.voice, a.shell) });
    const second = renderHook(useCapabilities, { wrapper: scope(b.voice, b.shell) });
    expect(first.result.current).toEqual(a);
    expect(second.result.current).toEqual(b);
    first.unmount();
    expect(second.result.current.voice).toBe(b.voice);
    expect(second.result.current.shell).toBe(b.shell);
  });

  it('does not retain a removed root’s registrations in a later mount', () => {
    renderHook(useCapabilities, { wrapper: scope(backend(), chrome()) }).unmount();
    const next = renderHook(useCapabilities);
    expect(next.result.current).toEqual({ voice: null, shell: null });
  });
});
