import { describe, expect, it } from 'vitest';
import { keptFromKids } from './kids-routes';

describe('the screens a Kids session never opens on the phone', () => {
  it('holds account settings, the lock, pairing, discovery and its notification choices', () => {
    for (const screen of [
      '/edit-profile',
      '/profile-pin',
      '/connect-device',
      '/discover/movie/603',
      '/settings/notifications',
      '/add-kids',
    ]) {
      expect(keptFromKids(screen)).toBe(true);
    }
  });

  it('leaves the catalogue, search, downloads, the player and the other settings open', () => {
    for (const screen of [
      '/',
      '/search',
      '/downloads',
      '/player/abc',
      '/settings',
      '/settings/language',
    ]) {
      expect(keptFromKids(screen)).toBe(false);
    }
  });
});
