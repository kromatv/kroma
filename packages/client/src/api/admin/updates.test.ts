import { describe, expect, it } from 'vitest';
import { UpdateStatus } from './updates';

const status = (url: string) => ({
  version: '0.1.40',
  build: 3_571_174,
  channel: 'Stable',
  auto: true,
  latest: { version: '0.1.41', build: null, url, publishedAt: null },
  available: true,
});

describe('UpdateStatus', () => {
  it('reads a release whose notes are an https page', () => {
    expect(
      UpdateStatus.parse(status('https://github.com/kromatv/kroma/releases/tag/v0.1.41')).latest
        ?.version,
    ).toBe('0.1.41');
  });

  it('refuses a notes link that is not https', () => {
    expect(UpdateStatus.safeParse(status('javascript:alert(1)')).success).toBe(false);
  });
});
