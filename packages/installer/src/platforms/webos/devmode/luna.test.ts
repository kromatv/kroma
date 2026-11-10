import { describe, expect, it, vi } from 'vitest';
import { type LunaCall, lunaCall, lunaCommand } from './luna';
import type { DevModeSession, RunningCommand } from './session';

const ADDRESS = { service: 'com.webos.appInstallService', folder: 'dev', method: 'install' };

interface Scripted {
  session: DevModeSession;
  close: ReturnType<typeof vi.fn>;
  print(text: string): void;
  exit(code: number): void;
}

const scripted = (): Scripted => {
  let onData: (chunk: Buffer) => void = () => undefined;
  let finish: (code: number) => void = () => undefined;
  const close = vi.fn();
  const running: RunningCommand = {
    exited: new Promise((resolve) => {
      finish = resolve;
    }),
    close,
  };
  const session = {
    stream: vi.fn(async (_command: string, listener: (chunk: Buffer) => void) => {
      onData = listener;
      return running;
    }),
  } as unknown as DevModeSession;
  return {
    session,
    close,
    print: (text) => onData(Buffer.from(text)),
    exit: (code) => finish(code),
  };
};

const call = (overrides: Partial<LunaCall> = {}): LunaCall => ({
  address: ADDRESS,
  param: { subscribe: true },
  timeoutMs: 1_000,
  ...overrides,
});

const settled = () => new Promise((resolve) => setImmediate(resolve));

describe('lunaCommand', () => {
  it('runs an interactive call when no reply count is given', () => {
    expect(lunaCommand(call())).toBe(
      `/usr/bin/luna-send-pub -i luna://com.webos.appInstallService/dev/install '{"subscribe":true}'`,
    );
  });

  it('leaves the folder empty, as ares joins it, for a method that has none', () => {
    const launch = { service: 'com.webos.applicationManager', method: 'launch' };

    expect(lunaCommand(call({ address: launch, replies: 1, sessionId: 'host-1' }))).toBe(
      `/usr/bin/luna-send-pub -n 1 -c host-1 luna://com.webos.applicationManager//launch '{"subscribe":true}'`,
    );
  });
});

describe('lunaCall', () => {
  it('settles on the first reply that decides, and stops luna-send', async () => {
    const tv = scripted();
    const answer = lunaCall(tv.session, call(), (reply) =>
      (reply as { done?: boolean }).done ? 'done' : undefined,
    );
    await settled();

    tv.print('{"done":false}\n{"do');
    tv.print('ne":true}\n');

    expect(await answer).toBe('done');
    expect(tv.close).toHaveBeenCalled();
  });

  it('hands a refusal to the caller when it reads every reply itself', async () => {
    const tv = scripted();
    const answer = lunaCall(tv.session, call({ failOnFalse: false }), (reply) => reply);
    await settled();

    tv.print('{"returnValue":false,"errorText":"Unknown method"}\n');

    expect(await answer).toEqual({ returnValue: false, errorText: 'Unknown method' });
  });

  it('quotes the error message of a refusal that carries no error text', async () => {
    const tv = scripted();
    const answer = lunaCall(tv.session, call(), () => undefined);
    await settled();

    tv.print('{"returnValue":false,"errorMessage":"Denied"}\n');

    await expect(answer).rejects.toThrow('com.webos.appInstallService refused: Denied');
  });

  it('says so when a refusal gives no reason at all', async () => {
    const tv = scripted();
    const answer = lunaCall(tv.session, call(), () => undefined);
    await settled();

    tv.print('{"returnValue":false}\n');

    await expect(answer).rejects.toThrow('refused: no reason given');
  });

  it('refuses an answer that grows past any reply the TV sends', async () => {
    const tv = scripted();
    const answer = lunaCall(tv.session, call(), () => undefined);
    await settled();

    tv.print(`{"padding":"${'x'.repeat(70_000)}`);

    await expect(answer).rejects.toThrow('luna-send printed an answer too long to read');
  });

  it('refuses a call the TV never answers in time', async () => {
    const tv = scripted();

    await expect(lunaCall(tv.session, call({ timeoutMs: 20 }), () => undefined)).rejects.toThrow(
      'com.webos.appInstallService gave no answer in time',
    );
    expect(tv.close).toHaveBeenCalled();
  });

  it('refuses a call whose luna-send ended before any verdict', async () => {
    const tv = scripted();
    const answer = lunaCall(tv.session, call(), () => undefined);
    await settled();

    tv.exit(1);

    await expect(answer).rejects.toThrow('ended with no answer (exit 1)');
  });

  it('refuses a call the session could not start', async () => {
    const session = {
      stream: vi.fn(async () => {
        throw new Error('channel open failure');
      }),
    } as unknown as DevModeSession;

    await expect(lunaCall(session, call(), () => undefined)).rejects.toThrow(
      'channel open failure',
    );
  });

  it('stops luna-send that only started once the call was over', async () => {
    const close = vi.fn();
    let start: (running: RunningCommand) => void = () => undefined;
    const session = {
      stream: vi.fn(() => new Promise<RunningCommand>((resolve) => (start = resolve))),
    } as unknown as DevModeSession;

    await expect(lunaCall(session, call({ timeoutMs: 5 }), () => undefined)).rejects.toThrow(
      'in time',
    );
    start({ exited: new Promise(() => undefined), close });

    await settled();
    expect(close).toHaveBeenCalled();
  });
});
