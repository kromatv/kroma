import { describe, expect, it } from 'vitest';
import { adoptMediaTicket } from './adopt-media-ticket';
import type { RequestContext } from './request-context';

function transport() {
  let held: string | undefined;
  const ctx = {
    mediaTicket: () => held,
    setMediaTicket: (ticket: string | undefined) => {
      held = ticket;
    },
  } as RequestContext;
  return { ctx, ticket: () => held };
}

describe('adopting the media ticket a sign-in answered with', () => {
  it('hands the transport the ticket and the answer back untouched', async () => {
    const { ctx, ticket } = transport();
    const answer = { token: 'tok', mediaTicket: 'dev.999.sig' };

    await expect(adoptMediaTicket(ctx, Promise.resolve(answer))).resolves.toBe(answer);

    expect(ticket()).toBe('dev.999.sig');
  });

  it('leaves the held ticket alone when the answer carries none', async () => {
    const { ctx, ticket } = transport();
    ctx.setMediaTicket('dev.999.sig');

    await adoptMediaTicket(ctx, Promise.resolve({ status: 'pending' }));
    await adoptMediaTicket(ctx, Promise.resolve({ token: 'tok' }));
    await adoptMediaTicket(ctx, Promise.resolve({ mediaTicket: '' }));

    expect(ticket()).toBe('dev.999.sig');
  });

  it('adopts the one a pairing poll hands over once the device is authorized', async () => {
    const { ctx, ticket } = transport();

    await adoptMediaTicket(
      ctx,
      Promise.resolve({ status: 'authorized', token: 'tok', mediaTicket: 'dev.1.sig' }),
    );

    expect(ticket()).toBe('dev.1.sig');
  });

  it('lets a rejected sign-in through rather than swallowing it', async () => {
    const { ctx, ticket } = transport();

    await expect(adoptMediaTicket(ctx, Promise.reject(new Error('401')))).rejects.toThrow('401');

    expect(ticket()).toBeUndefined();
  });
});
