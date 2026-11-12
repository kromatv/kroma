import { z } from 'zod';
import { type LunaAddress, lunaCall } from './luna';
import type { DevModeSession } from './session';

const ANSWER_TIMEOUT_MS = 30_000;
const DEFAULT_DISPLAY = 0;

const SESSION_LIST: LunaAddress = {
  service: 'com.webos.service.sessionmanager',
  method: 'getSessionList',
};
const LAUNCH: LunaAddress = { service: 'com.webos.applicationManager', method: 'launch' };

const SessionList = z.object({
  returnValue: z.literal(true),
  sessionList: z
    .array(
      z.object({
        sessionId: z
          .string()
          .min(1)
          .max(256)
          .regex(/^[\w.-]+$/),
        deviceSetInfo: z.object({ displayId: z.number() }),
      }),
    )
    .max(64),
});

const Launched = z.object({ returnValue: z.literal(true) });

/**
 * Starts an installed app as `ares-launch` does: on the session of the first
 * display when the set runs a session manager, on display 0 when it does not.
 */
export async function launchApp(session: DevModeSession, appId: string): Promise<void> {
  const sessionId = await displaySession(session);
  await lunaCall(
    session,
    {
      address: LAUNCH,
      param: {
        id: appId,
        subscribe: false,
        params: sessionId ? {} : { displayAffinity: DEFAULT_DISPLAY },
      },
      replies: 1,
      sessionId: sessionId ?? undefined,
      timeoutMs: ANSWER_TIMEOUT_MS,
    },
    (reply) => {
      if (Launched.safeParse(reply).success) return true;
      throw new Error(`the TV did not start ${appId}`);
    },
  );
}

async function displaySession(session: DevModeSession): Promise<string | null> {
  try {
    return await lunaCall(
      session,
      {
        address: SESSION_LIST,
        param: { subscribe: false },
        replies: 1,
        failOnFalse: false,
        timeoutMs: ANSWER_TIMEOUT_MS,
      },
      (reply) => {
        const listed = SessionList.safeParse(reply);
        if (!listed.success) return null;
        const shown = listed.data.sessionList.find(
          (entry) => entry.deviceSetInfo.displayId === DEFAULT_DISPLAY,
        );
        return shown?.sessionId ?? null;
      },
    );
  } catch {
    return null;
  }
}
