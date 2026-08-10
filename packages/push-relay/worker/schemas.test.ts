import { describe, expect, it } from 'vitest';
import { firstIssue, GrantRequest, PushRequest } from './schemas';

describe('firstIssue', () => {
  it('names the offending field and repeats nothing the caller sent', () => {
    const result = PushRequest.safeParse({
      grant: 'v1.abc',
      notification: { id: 'n1', title: 'x'.repeat(500) },
    });
    const message = firstIssue(result.error ?? { issues: [] });
    expect(message).toContain('notification.title');
    expect(message).not.toContain('xxxx');
  });

  it('reports a root-level rejection without an empty field prefix', () => {
    const result = GrantRequest.safeParse('not an object');
    const message = firstIssue(result.error ?? { issues: [] });
    expect(message).toBe('Invalid input: expected object, received string');
  });

  it('has something to say even about an error carrying no issue', () => {
    expect(firstIssue({ issues: [] })).toBe('invalid request');
  });
});
