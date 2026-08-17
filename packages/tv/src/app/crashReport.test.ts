import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCrashReport } from '#tv/app/crashReport';

vi.mock('#tv/app/clientBuild', () => ({
  buildInfo: () => ({ version: '1.2.3', commit: 'abc123' }),
}));

const tvIdentity = vi.fn();
vi.mock('#tv/app/apiClient', () => ({ tvIdentity: () => tvIdentity() }));

afterEach(() => tvIdentity.mockReset());

describe('buildCrashReport', () => {
  it('carries the error, the component stack, and the build/device metadata', () => {
    tvIdentity.mockReturnValue({ version: '1.2.3', model: 'BRAVIA 4K', os: 'Android TV 14' });
    const report = buildCrashReport(new Error('kaboom'), '\n  at Player', 'Android TV', 42);
    expect(report.message).toBe('kaboom');
    expect(report.stack).toContain('kaboom');
    expect(report.stack).toContain('at Player');
    expect(report.platform).toBe('Android TV');
    expect(report.capturedAt).toBe(42);
    expect(report.build).toEqual({ version: '1.2.3', commit: 'abc123' });
    expect(report.device).toEqual({ model: 'BRAVIA 4K', os: 'Android TV 14' });
  });

  it('leaves the device null when the platform exposes no identity', () => {
    tvIdentity.mockReturnValue(null);
    const report = buildCrashReport(new Error('boom'), null, 'Web', 0);
    expect(report.device).toBeNull();
  });

  it('coerces a non-error throw into a message', () => {
    tvIdentity.mockReturnValue(null);
    const report = buildCrashReport('just a string', null, 'Web', 0);
    expect(report.message).toBe('just a string');
  });

  it('falls back when the error carries neither a stack nor a message', () => {
    tvIdentity.mockReturnValue(null);
    const bare = new Error('');
    bare.stack = undefined;
    const report = buildCrashReport(bare, null, 'Web', 0);
    expect(report.message).toBe('Unknown error');
    expect(report.stack).toBe('');
  });
});
