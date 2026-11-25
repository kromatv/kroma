import type { DeviceId } from '@kromatv/client';
import { type Screen, ScreenRequest } from '@kromatv/client/diagnostics';
import type { ServerEvent } from '@kromatv/client/events';
import type { EventTap } from '#tv/app/event-tap';

/** How this television names itself to an admin who lists its screens. */
export interface ScreenIdentity {
  screenId: DeviceId;
  name: string;
  platform: string;
}

/** Reads what is on screen right now. */
export type ReadScreen = () => Promise<Screen>;

async function readOwnScreen(): Promise<Screen> {
  const { describeScreen, screenRows } = await import('@kromatv/ui/inspect');
  return screenRows(describeScreen());
}

function answer(tap: EventTap, requestId: ScreenRequest['requestId'], read: ReadScreen): void {
  void read().then(
    (screen) => tap.send({ type: 'screen.reply', requestId, screen }),
    () => false,
  );
}

/** Says hello on every open of the tap's socket, and answers each request
 * addressed to this screen with what it shows. Reads nothing until asked.
 * Returns the function that stops it. */
export function createScreenResponder(
  tap: EventTap,
  self: () => ScreenIdentity,
  read: ReadScreen = readOwnScreen,
): () => void {
  return tap.listen({
    onOpen: () => {
      tap.send({ type: 'screen.hello', ...self() });
    },
    onEvent: (event: ServerEvent) => {
      if (event.type !== 'screen.request') {
        return;
      }
      const request = ScreenRequest.safeParse(event);
      if (request.success && request.data.screenId === self().screenId) {
        answer(tap, request.data.requestId, read);
      }
    },
  });
}
