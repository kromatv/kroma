import { describe, expect, it } from 'vitest';
import { clientBody, declaredValues, fieldsOf } from './client-fields';

describe('clientBody', () => {
  it('puts a field the engine declared beyond the credentials under settings', () => {
    const body = clientBody({ name: 'SAB', url: ' http://nas:8080 ', apiKey: 'k' });

    expect(body).toEqual({
      name: 'SAB',
      url: 'http://nas:8080',
      username: null,
      password: null,
      settings: { apiKey: 'k' },
    });
  });

  it('keeps the credentials out of settings', () => {
    const body = clientBody({ url: 'http://nas:6789', username: ' kroma ', password: 'p' });

    expect(body.username).toBe('kroma');
    expect(body.password).toBe('p');
    expect(body.settings).toEqual({});
  });

  it('sends an empty password as none, so the stored one is kept', () => {
    expect(clientBody({ url: 'u', password: '' }).password).toBeNull();
  });
});

describe('fieldsOf', () => {
  it('falls back to a URL and credentials when no enabled engine describes the client', () => {
    expect(fieldsOf([], 'deluge').map((f) => f.key)).toEqual(['url', 'username', 'password']);
  });
});

describe('declaredValues', () => {
  it('sends every declared field, empty when it was left untouched', () => {
    const fields = fieldsOf([], 'x');

    expect(declaredValues(fields, { url: 'u' })).toEqual({ url: 'u', username: '', password: '' });
  });
});
