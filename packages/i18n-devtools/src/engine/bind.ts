import { liveState, onLiveChange } from '../live';
import { forgetMarks } from '../overlay/mark';
import { engine } from './engine';
import { inspectorFor } from './inspector';

/**
 * Keep the engine set to whatever the switches say.
 *
 * Not a React effect. Putting a switch on the page can cost the panel its
 * mount - an engine whose messages do not subscribe to anything is refreshed
 * through the module the tools were injected into, which re-runs them both -
 * and an effect would tear the switch down on the way out, undoing what it was
 * asked to do. The switches live on the page, so what applies them does too.
 * Returns a disposer that stops watching and leaves the engine as it is.
 */
export function bindEngine(): () => void {
  const apply = () => {
    const { keys, outline, locale } = liveState();
    const inspector = inspectorFor(keys, outline);
    // What a mark stands for is remembered beside it, and only for as long as
    // marks are being drawn: forgetting when the panel unmounts would take the
    // keys off text a refresh had just marked.
    if (!inspector) forgetMarks();
    engine().inspect(inspector);
    engine().overrideLocale(locale);
  };
  apply();
  return onLiveChange(apply);
}
