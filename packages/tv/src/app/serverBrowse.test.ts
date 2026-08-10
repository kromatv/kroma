import { afterEach, describe, expect, it } from 'vitest';
import { type ServerBrowse, serverBrowse, setServerBrowse } from './serverBrowse';

afterEach(() => setServerBrowse(null));

describe('serverBrowse', () => {
  it('answers null on a target that cannot browse mDNS from JavaScript', () => {
    expect(serverBrowse()).toBeNull();
  });

  it('hands back the browser the shell registered, until it is cleared', async () => {
    const browse: ServerBrowse = async () => [{ name: 'Salon', host: 'kroma.local', port: 4040 }];
    setServerBrowse(browse);
    expect(serverBrowse()).toBe(browse);
    await expect(serverBrowse()?.(500)).resolves.toEqual([
      { name: 'Salon', host: 'kroma.local', port: 4040 },
    ]);

    setServerBrowse(null);
    expect(serverBrowse()).toBeNull();
  });
});
