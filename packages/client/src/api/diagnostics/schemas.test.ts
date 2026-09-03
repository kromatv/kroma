import { describe, expect, it } from 'vitest';
import { CrashBuild, CrashDevice, CrashReport } from './schemas';

const REPORT = {
  message: 'boom',
  stack: 'at <anonymous>',
  platform: 'web',
  capturedAt: 1767225600,
  build: { version: '1.0.0', commit: 'abc1234' },
  device: { model: 'iPhone17,1', os: 'iOS 26.0' },
};

describe('a crash report', () => {
  it('reads a full report off the wire', () => {
    expect(CrashReport.parse(REPORT)).toEqual(REPORT);
  });

  it('reads a build with no commit and a device the shell could not name', () => {
    const bare = { ...REPORT, build: { version: '1.0.0', commit: null }, device: null };

    expect(CrashReport.parse(bare)).toEqual(bare);
  });

  it('refuses a report with nothing to say', () => {
    expect(() => CrashReport.parse({ ...REPORT, message: '' })).toThrow();
  });

  it('refuses a stack past the bound the sink accepts', () => {
    expect(() => CrashReport.parse({ ...REPORT, stack: 'x'.repeat(16001) })).toThrow();
  });

  it('refuses a capture time that is not a whole number of seconds', () => {
    expect(() => CrashReport.parse({ ...REPORT, capturedAt: -1 })).toThrow();
  });

  it('refuses build and device metadata past their bounds', () => {
    expect(() => CrashBuild.parse({ version: 'v'.repeat(257), commit: null })).toThrow();
    expect(() => CrashDevice.parse({ model: 'm', os: 42 })).toThrow();
  });
});
