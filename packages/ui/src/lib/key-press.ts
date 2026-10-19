import { type RefObject, useMemo } from 'react';
import { webDocument } from '#ui/lib/dom';
import { useFocusServices } from '#ui/lib/focus-services-context';
import { WEB } from '#ui/lib/platform';

/** The key props a browser element answers Enter and Space with; null where nothing does. */
export type KeyProps = {
  tabIndex: number;
  onKeyDown: (event: { nativeEvent: { key: string }; preventDefault: () => void }) => void;
} | null;

/** Enter and Space presses for a control on the browser targets, null on native. */
function useKeyPress(
  active: boolean,
  role: string,
  press: RefObject<() => void>,
  tabbable = true,
): { pressable: KeyProps; view: KeyProps } | null {
  const { mirror } = useFocusServices();
  return useMemo(() => {
    if (!WEB || !active) return null;
    const answering = (owns: (key: string) => boolean): KeyProps => ({
      tabIndex: tabbable ? 0 : -1,
      onKeyDown: (event) => {
        if (!owns(event.nativeEvent.key)) return;
        event.preventDefault();
        press.current();
      },
    });
    return {
      pressable: answering((key) => key === ' ' && role !== 'button'),
      view: answering(
        (key) =>
          (key === 'Enter' || key === ' ') &&
          !mirror.isMirrored(webDocument()?.activeElement ?? null),
      ),
    };
  }, [active, role, press, mirror, tabbable]);
}

export { useKeyPress };
