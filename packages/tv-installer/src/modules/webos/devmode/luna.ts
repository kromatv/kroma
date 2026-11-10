import { z } from 'zod';
import type { DevModeSession, RunningCommand } from './session';

const LUNA_SEND = '/usr/bin/luna-send-pub';

const MAX_REPLY_CHARS = 64 * 1024;

export interface LunaAddress {
  service: string;
  folder?: string;
  method: string;
}

export interface LunaCall {
  address: LunaAddress;
  param: Readonly<Record<string, unknown>>;
  replies?: number;
  sessionId?: string;
  failOnFalse?: boolean;
  timeoutMs: number;
}

const LunaFailure = z.object({
  returnValue: z.literal(false),
  errorText: z.string().max(4096).optional(),
  errorMessage: z.string().max(4096).optional(),
});

/** The command line ares builds for one luna call, `-i` unless a reply count is given. */
export function lunaCommand(call: Omit<LunaCall, 'timeoutMs'>): string {
  const { service, folder = '', method } = call.address;
  const url = ['luna:/', service, folder, method].join('/');
  const mode = call.replies ? `-n ${call.replies} ` : '-i ';
  const session = call.sessionId ? `-c ${call.sessionId} ` : '';
  return `${LUNA_SEND} ${mode}${session}${url} '${JSON.stringify(call.param)}'`;
}

function jsonReplies(onReply: (reply: unknown) => void): (chunk: Buffer) => void {
  let pending = '';
  return (chunk) => {
    for (const line of chunk.toString('utf8').split(/\r?\n/)) {
      pending += line;
      if (pending.length > MAX_REPLY_CHARS)
        throw new Error('luna-send printed an answer too long to read');
      const reply = parsed(pending);
      if (reply === undefined) continue;
      pending = '';
      onReply(reply);
    }
  };
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Runs one luna call and settles on the first reply `decide` answers for. A
 * reply whose `returnValue` is false refuses the call, unless `failOnFalse` is
 * off; so does luna-send ending, or the time running out, before any verdict.
 */
export function lunaCall<T>(
  session: DevModeSession,
  call: LunaCall,
  decide: (reply: unknown) => T | undefined,
): Promise<T> {
  const service = call.address.service;
  return new Promise<T>((resolve, reject) => {
    let running: RunningCommand | null = null;
    let settled = false;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      running?.close();
      finish();
    };
    const timer = setTimeout(
      () => settle(() => reject(new Error(`${service} gave no answer in time`))),
      call.timeoutMs,
    );

    const onReply = (reply: unknown) => {
      const failure = call.failOnFalse === false ? null : LunaFailure.safeParse(reply);
      if (failure?.success) {
        const why = failure.data.errorText ?? failure.data.errorMessage ?? 'no reason given';
        settle(() => reject(new Error(`${service} refused: ${why}`)));
        return;
      }
      const verdict = decide(reply);
      if (verdict !== undefined) settle(() => resolve(verdict));
    };
    const feed = jsonReplies(onReply);
    const onData = (chunk: Buffer) => {
      try {
        feed(chunk);
      } catch (error) {
        settle(() => reject(error));
      }
    };

    session.stream(lunaCommand(call), onData).then(
      (command) => {
        running = command;
        if (settled) command.close();
        void command.exited.then((code) =>
          settle(() => reject(new Error(`${service} ended with no answer (exit ${code})`))),
        );
      },
      (error: unknown) => settle(() => reject(error)),
    );
  });
}
