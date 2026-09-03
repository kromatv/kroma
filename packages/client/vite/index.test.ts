import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLIENT_API, kromaDomains } from './index.ts';

describe('the domain plugin', () => {
  it('points at the folder the domains live in', () => {
    expect(existsSync(join(CLIENT_API, 'media', 'client.ts'))).toBe(true);
  });

  it('hands a shell the domain-index plugin', () => {
    expect(kromaDomains().name).toBe('kroma:domains');
  });
});
