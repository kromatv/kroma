// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useQualityLabel } from './use-quality-label';

vi.mock('@kromatv/module-sdk', () => ({ useT: () => (key: string) => key }));

describe('a quality label', () => {
  it('writes a known quality the way a release name does', () => {
    const { result } = renderHook(() => useQualityLabel());

    expect(result.current('webdl-1080p')).toBe('WEB-DL 1080p');
  });

  it('reads a quality that names nothing in the reader language', () => {
    const { result } = renderHook(() => useQualityLabel());

    expect(result.current('unknown')).toBe('acq.qualityUnknown');
  });
});
