// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Origin } from './origin';
import { useOrigin } from './use-origin';

const AT: Origin = {
  url: 'http://localhost:3000/@fs/kroma/clients/web/src/app.tsx',
  file: '/kroma/clients/web/src/app.tsx',
  line: 42,
  column: 7,
  source: false,
};

describe('where a string is written, as the panel reads it', () => {
  it('says nothing for a string it was given no origin for', () => {
    expect(renderHook(() => useOrigin(null)).result.current).toBeNull();
  });

  it('names the file and the line a person would look for', () => {
    expect(renderHook(() => useOrigin(AT)).result.current).toEqual({
      label: 'app.tsx:42',
      file: '/kroma/clients/web/src/app.tsx:42:7',
    });
  });

  it('takes the served origin on a server, having nothing traced to read', () => {
    function Where() {
      return useOrigin(AT)?.label ?? '';
    }

    expect(renderToString(<Where />)).toBe('app.tsx:42');
  });
});
