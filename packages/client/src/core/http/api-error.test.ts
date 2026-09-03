import { describe, expect, it } from 'vitest';
import { apiErrorBody, apiErrorText, KromaApiError, KromaSchemaError } from './api-error';

describe('KromaApiError', () => {
  it('carries status, message, body and name', () => {
    const e = new KromaApiError(404, 'GET /x failed (404)', { error: 'nope' });
    expect(e.status).toBe(404);
    expect(e.name).toBe('KromaApiError');
    expect(e.body).toEqual({ error: 'nope' });
    expect(e).toBeInstanceOf(Error);
  });
});

describe('KromaSchemaError', () => {
  it('names the path and the offending fields rather than dumping a ZodError', () => {
    const e = new KromaSchemaError('/items', [
      { code: 'invalid_type', path: ['0', 'id'], message: 'Invalid input: expected string' },
    ] as never);
    expect(e.name).toBe('KromaSchemaError');
    expect(e.path).toBe('/items');
    expect(e.message).toContain('/items');
    expect(e.message).toContain('0.id');
  });
});

describe('apiErrorText', () => {
  it('prefers the server error body text', () => {
    expect(apiErrorText(new KromaApiError(400, 'x', { error: 'PIN requis' }), 'oops')).toBe(
      'PIN requis',
    );
  });

  it('uses the fallback for a blank, missing or foreign error', () => {
    expect(apiErrorText(new KromaApiError(400, 'x', { error: '   ' }), 'oops')).toBe('oops');
    expect(apiErrorText(new KromaApiError(400, 'x'), 'oops')).toBe('oops');
    expect(apiErrorText(new Error('boom'), 'oops')).toBe('oops');
  });
});

describe('apiErrorBody', () => {
  it('reads the flags the server tags an auth failure with', () => {
    const e = new KromaApiError(401, 'x', { error: 'locked', pinRequired: true, retryAfter: 30 });
    expect(apiErrorBody(e)).toEqual({ error: 'locked', pinRequired: true, retryAfter: 30 });
  });

  it('drops a field the server did not shape and keeps the rest', () => {
    const e = new KromaApiError(429, 'x', { error: 'slow down', retryAfter: 'soon' });
    expect(apiErrorBody(e)).toEqual({ error: 'slow down', retryAfter: undefined });
  });

  it('is empty for a foreign error and for a body that is not an object', () => {
    expect(apiErrorBody(new Error('boom'))).toEqual({});
    expect(apiErrorBody(new KromaApiError(500, 'x', 'plain text'))).toEqual({});
  });
});
