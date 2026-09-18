import { fromB64url } from '@kromatv/relay-grant';
import type { Attachment } from './schemas';

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
  headers?: Record<string, string>;
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

/**
 * One send. The sender is the relay's address with the real host of the
 * server that wrote the message as its display name, so every mail client
 * shows who is behind it before a word of the body is read. `optOut` is the
 * relay's own link for this mailbox to stop mail from this server; carried
 * as the list headers mail clients turn into an unsubscribe button.
 */
export async function deliver(
  email: EmailSender,
  env: { FROM_ADDRESS: string; FROM_NAME: string },
  to: string,
  origin: string,
  message: { subject: string; text: string; html: string; attachments: Attachment[] },
  optOut?: string,
): Promise<void> {
  await email.send({
    to,
    from: { email: env.FROM_ADDRESS, name: `${new URL(origin).host} via ${env.FROM_NAME}` },
    subject: message.subject,
    text: message.text,
    html: message.html,
    ...(optOut
      ? {
          headers: {
            'List-Unsubscribe': `<${optOut}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }
      : {}),
    attachments: message.attachments.map((a) => ({
      content: fromB64url(a.content).buffer,
      filename: a.filename,
      type: a.type,
      disposition: 'inline',
      contentId: a.contentId,
    })),
  });
}

export type FailureStatus = 410 | 429 | 502;

/**
 * What a send failure means to the server. Cloudflare's binding throws with a
 * code; a suppressed address (it bounced, or reported spam) is the one failure
 * about the mailbox rather than the moment, so it is 410 and the relay stops
 * carrying mail to it. Everything else is transient.
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
