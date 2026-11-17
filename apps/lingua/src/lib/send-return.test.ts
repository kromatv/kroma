import { describe, expect, it } from 'vitest';
import { returnAddress, returnedFrom } from './send-return';

describe('send-return', () => {
  it('reads back each way a send comes back from the address it returns to', () => {
    const sent = returnAddress('/o/r/fr', { kind: 'sent', number: 9 });
    const declined = returnAddress('/o/r/fr', { kind: 'declined' });
    const refused = returnAddress('/o/r/fr', { kind: 'failed', reason: 'diverged' });

    const read = [sent, declined, refused].map((to) =>
      returnedFrom(new URL(to, 'https://x').search),
    );

    expect(read).toEqual([
      { kind: 'sent', number: 9 },
      { kind: 'declined' },
      { kind: 'failed', reason: 'diverged' },
    ]);
  });

  it('reads nothing into a query it did not write', () => {
    expect(returnedFrom('?send=hello')).toBeNull();
    expect(returnedFrom('?sent=-1')).toBeNull();
    expect(returnedFrom('')).toBeNull();
  });
});
