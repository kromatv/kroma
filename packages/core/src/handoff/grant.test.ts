// Reading a refused grant. What matters here: the four endings stay four, and
// the two a person can act on stay apart from the two they cannot.

import { KromaApiError } from '@kroma/client';
import { describe, expect, it } from 'vitest';
import { checkRetryable, grantRefusal } from './grant';

function refused(status: number) {
  return new KromaApiError(status, `POST /handoff/grant failed (${status})`, {
    error: 'a message the server already localized',
  });
}

describe('reading a refusal', () => {
  it('tells the four endings apart by status', () => {
    expect(grantRefusal(refused(400))).toBe('checkRequired');
    expect(grantRefusal(refused(403))).toBe('checkWrong');
    expect(grantRefusal(refused(429))).toBe('checkTooMany');
    expect(grantRefusal(refused(404))).toBe('gone');
  });

  it('reads the status and never the message', () => {
    // The server localizes before it answers, so the text is French on a French
    // phone and matching on it would work in exactly one language.
    const french = new KromaApiError(403, 'POST /handoff/grant failed (403)', {
      error: 'Code incorrect',
    });
    expect(grantRefusal(french)).toBe('checkWrong');
  });

  it('reads a dropped request as the ending that promises nothing', () => {
    expect(grantRefusal(new TypeError('network request failed'))).toBe('gone');
    expect(grantRefusal(undefined)).toBe('gone');
    expect(grantRefusal(refused(503))).toBe('gone');
  });
});

describe('what is worth another code', () => {
  it('keeps the prompt up while the beacon is still standing', () => {
    expect(checkRetryable('checkRequired')).toBe(true);
    expect(checkRetryable('checkWrong')).toBe(true);
  });

  it('does not offer a retry once the beacon is spent', () => {
    // A wrong code that burned the beacon and a television that stopped waiting
    // are both final: another code cannot reach either.
    expect(checkRetryable('checkTooMany')).toBe(false);
    expect(checkRetryable('gone')).toBe(false);
  });
});
