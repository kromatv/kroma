import { LOGO_PNG } from './logo';

/** The `send_email` binding, declared locally like the rate limiter's. */
export interface EmailSender {
  send(message: OutboundMessage): Promise<unknown>;
}

export interface OutboundMessage {
  to: string;
  from: { email: string; name: string };
  subject: string;
  text: string;
  html: string;
  attachments: {
    content: ArrayBuffer;
    filename: string;
    type: string;
    disposition: 'inline';
    contentId: string;
  }[];
}

const REASON_MAX = 200;

export const printable = (reason: string): string =>
  reason.replace(/[^ -~]/g, '').slice(0, REASON_MAX);

/** One send, with the relay's own logo riding inline as `cid:logo`. */
export async function deliver(
  email: EmailSender,
  env: { FROM_ADDRESS: string; FROM_NAME: string },
  to: string,
  message: { subject: string; text: string; html: string },
): Promise<void> {
  await email.send({
    to,
    from: { email: env.FROM_ADDRESS, name: env.FROM_NAME },
    ...message,
    attachments: [
      {
        content: LOGO_PNG,
        filename: 'logo.png',
        type: 'image/png',
        disposition: 'inline',
        contentId: 'logo',
      },
    ],
  });
}

export type FailureStatus = 410 | 429 | 502;

/**
 * What a send failure means to the server. Cloudflare's binding throws with a
 * code; a suppressed address (it bounced, or reported spam) is the one failure
 * about the mailbox rather than the moment, so it is 410 and the server drops
 * the grant. Everything else is transient.
 */
export function failure(e: unknown): { status: FailureStatus; error: string } {
  const code = typeof e === 'object' && e && 'code' in e ? String(e.code) : '';
  console.error(JSON.stringify({ event: 'relay.rejected', code, message: printable(String(e)) }));
  if (code === 'E_RECIPIENT_SUPPRESSED') return { status: 410, error: 'address suppressed' };
  if (code === 'E_RATE_LIMIT_EXCEEDED' || code === 'E_DAILY_LIMIT_EXCEEDED') {
    return { status: 429, error: 'the mail service is throttling' };
  }
  return { status: 502, error: 'upstream mail service failed' };
}
