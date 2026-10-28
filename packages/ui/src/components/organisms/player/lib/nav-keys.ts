import type { PlayerNavActions } from '#ui/components/organisms/player/hooks/use-player-nav';
import type { RemoteKey } from '#ui/lib/remote-keys';

/** The keys {@link handleMediaKey} answers: a transport press drives the film
 *  itself, so it acts wherever the player is rather than waiting for the chrome. */
const TRANSPORT_KEYS: ReadonlySet<RemoteKey> = new Set([
  'Play',
  'Pause',
  'PlayPause',
  'Next',
  'Prev',
  'Rewind',
  'FastForward',
  'Stop',
]);

/** The transport keys that only move the film: the stage pill says where it
 *  went, so a hidden chrome can stay hidden. */
const SEEK_KEYS: ReadonlySet<RemoteKey> = new Set(['Prev', 'Rewind', 'FastForward']);

function handleMediaKey(key: RemoteKey, a: PlayerNavActions): boolean {
  switch (key) {
    case 'Play':
    case 'Pause':
    case 'PlayPause':
      a.togglePlay();
      return true;
    case 'Next':
      a.onNext();
      return true;
    case 'Prev':
    case 'Rewind':
      a.seekNudge(-1, 'hold');
      return true;
    case 'FastForward':
      a.seekNudge(1, 'hold');
      return true;
    case 'Stop':
      a.onExit('stop');
      return true;
    default:
      return false;
  }
}

export { handleMediaKey, SEEK_KEYS, TRANSPORT_KEYS };
