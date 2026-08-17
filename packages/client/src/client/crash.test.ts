import { describe, expect, it } from 'vitest';
import type { CrashReport } from '../types';
import type { RequestContext } from './base';
import { reportCrash } from './crash';

function recordCtx() {
  const calls: { path: string; init?: RequestInit }[] = [];
  const ctx = {
    baseUrl: 'http://nas',
    json: async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      return undefined as never;
    },
  } as unknown as RequestContext;
  return { ctx, calls };
}

const report: CrashReport = {
  message: 'boom',
  stack: 'at render',
  platform: 'Android TV',
  capturedAt: 1_700_000_000_000,
  build: { version: '1.2.3', commit: 'abc123' },
  device: { model: 'BRAVIA 4K', os: 'Android TV 14' },
};

describe('reportCrash', () => {
  it('POSTs the report as JSON to /diagnostics/crash', () => {
    const { ctx, calls } = recordCtx();
    void reportCrash(ctx, report);
    expect(calls[0]?.path).toBe('/diagnostics/crash');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual(report);
  });
});
