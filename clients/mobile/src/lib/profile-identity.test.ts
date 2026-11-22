import { describe, expect, it } from 'vitest';
import { profileIdentity } from './profile-identity';

describe('the signed-in profile as the account tab shows it', () => {
  it('names the profile, shows its address and opens the profile editor', () => {
    const identity = profileIdentity({
      username: 'Ana',
      email: 'ana@kroma.tv',
      avatarUrl: '/a.jpg',
      kids: false,
    });

    expect(identity).toEqual({
      name: 'Ana',
      addresses: ['ana@kroma.tv'],
      avatarPath: '/a.jpg',
      editable: true,
    });
  });

  it('shows no address and opens no editor for a Kids session', () => {
    const identity = profileIdentity({
      username: 'Léo',
      email: 'kids-leo@kroma.invalid',
      avatarUrl: null,
      kids: true,
    });

    expect(identity).toMatchObject({ addresses: [], editable: false, avatarPath: null });
  });

  it('shows no address for a profile that has none', () => {
    expect(profileIdentity({ username: 'Ben', email: '', kids: false }).addresses).toEqual([]);
  });

  it('draws an empty profile before anyone is in', () => {
    expect(profileIdentity(null)).toEqual({
      name: '',
      addresses: [],
      avatarPath: null,
      editable: false,
    });
  });
});
