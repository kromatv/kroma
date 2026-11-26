import type { User } from '@kromatv/client/accounts';
import { describe, expect, it, vi } from 'vitest';
import { saveTrackLanguage, type TrackLanguage, type TrackLanguageHost } from './track-language';

function account(saved: Pick<User, TrackLanguage>) {
  const update = vi.fn(async () => ({ user: saved }));
  const updateUser = vi.fn();
  const host: TrackLanguageHost = { client: { accounts: { update } }, updateUser };
  return { host, update, updateUser };
}

describe('saveTrackLanguage', () => {
  it('saves no preference as nothing at all', async () => {
    const { host, update } = account({ audioLanguage: null });

    await saveTrackLanguage(host, 'audioLanguage', 'none');

    expect(update).toHaveBeenCalledWith({ audioLanguage: null });
  });

  it('saves a language by its code', async () => {
    const { host, update } = account({ subtitleLanguage: 'fr-ca' });

    await saveTrackLanguage(host, 'subtitleLanguage', 'fr-CA');

    expect(update).toHaveBeenCalledWith({ subtitleLanguage: 'fr-CA' });
  });

  it('keeps what the account holds now, and hands it back as a picker reads it', async () => {
    const { host, updateUser } = account({ subtitleLanguage: 'fr-ca' });

    const value = await saveTrackLanguage(host, 'subtitleLanguage', 'fr-CA');

    expect(updateUser).toHaveBeenCalledWith({ subtitleLanguage: 'fr-ca' });
    expect(value).toBe('fr-CA');
  });

  it('hands back no preference when the account holds none', async () => {
    const { host } = account({});

    expect(await saveTrackLanguage(host, 'audioLanguage', 'none')).toBe('none');
  });
});
