import { ProviderId, type SignInAdmin } from '@kromatv/client/sso';
import { describe, expect, it } from 'vitest';
import {
  emptyProvider,
  groupList,
  isDirty,
  reasonKey,
  scopeList,
  toForm,
  toSave,
} from '#web/features/admin/sign-in-form';

const config: SignInAdmin = {
  password: true,
  passkeys: true,
  redirectUris: ['https://kroma.example/api/auth/sso/callback'],
  providers: [
    {
      id: ProviderId.parse('p0'),
      label: 'Home',
      icon: 'home',
      issuer: 'https://id.example',
      clientId: 'kroma',
      hasSecret: true,
      scopes: ['offline_access', 'custom'],
      groupClaim: 'groups',
      requiredGroups: ['Family members', 'admins'],
      newPeople: 'ask',
      permissions: ['playback'],
      libraries: null,
      enabled: true,
      tested: true,
      live: true,
      fromEnv: false,
    },
  ],
};

describe('the sign-in form', () => {
  it('shows the two lists as the text an admin would type', () => {
    const provider = toForm(config).providers[0];

    expect(provider?.scopes).toBe('offline_access custom');
    expect(provider?.requiredGroups).toBe('Family members, admins');
    expect(provider?.clientSecret).toBe('');
  });

  it('saves back what it was given, and says nothing of a secret nobody typed', () => {
    const saved = toSave(toForm(config)).providers[0];

    expect(saved?.scopes).toEqual(['offline_access', 'custom']);
    expect(saved?.requiredGroups).toEqual(['Family members', 'admins']);
    expect(saved && 'clientSecret' in saved).toBe(false);
    expect(saved && 'live' in saved).toBe(false);
  });

  it('sends a secret once one is typed', () => {
    const form = toForm(config);
    const typed = {
      ...form,
      providers: form.providers.map((p) => ({ ...p, clientSecret: 'new' })),
    };

    expect(toSave(typed).providers[0]?.clientSecret).toBe('new');
  });

  it('is dirty once a field that saves has changed, and not for one that does not', () => {
    const saved = toForm(config);
    const relabelled = {
      ...saved,
      providers: saved.providers.map((p) => ({ ...p, label: 'Work' })),
    };
    const sameAfterTrim = {
      ...saved,
      providers: saved.providers.map((p) => ({ ...p, label: ' Home ', live: false })),
    };

    expect(isDirty(saved, saved)).toBe(false);
    expect(isDirty(relabelled, saved)).toBe(true);
    expect(isDirty(sameAfterTrim, saved)).toBe(false);
    expect(isDirty({ ...saved, password: false }, saved)).toBe(true);
  });

  it('starts a new provider asking an admin first, enabled, with no id', () => {
    const fresh = emptyProvider('draft-0');

    expect(fresh.id).toBe('');
    expect(fresh.newPeople).toBe('ask');
    expect(fresh.enabled).toBe(true);
    expect(fresh.permissions).toEqual(['playback']);
  });
});

describe('the lists an admin types', () => {
  it('reads scopes separated by any white space', () => {
    expect(scopeList('  offline_access   custom\ngroups ')).toEqual([
      'offline_access',
      'custom',
      'groups',
    ]);
    expect(scopeList('')).toEqual([]);
  });

  it('reads groups separated by commas or lines, keeping the spaces inside a name', () => {
    expect(groupList('Family members, admins\n kids ,')).toEqual([
      'Family members',
      'admins',
      'kids',
    ]);
    expect(groupList(' ')).toEqual([]);
  });
});

describe('reasonKey', () => {
  it('names the message of a failure the page has words for', () => {
    expect(reasonKey('token.audience')).toBe('sso.reason.token.audience');
    expect(reasonKey('exchange.invalid_client')).toBe('sso.reason.exchange.invalid_client');
  });

  it('has no words for a code it does not know', () => {
    expect(reasonKey('exchange.server_error')).toBeNull();
    expect(reasonKey('')).toBeNull();
  });
});
