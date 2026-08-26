import { type RefObject, useMemo } from 'react';
import { WEB } from '#ui/lib/platform';
import type { FocusRole, WebKeys } from './focusable-types';

function useWebKeys(
  active: boolean,
  role: FocusRole,
  press: RefObject<() => void>,
): { pressable: WebKeys; view: WebKeys } | null {
  return useMemo(() => {
    if (!WEB || !active) return null;
    const answering = (owns: (key: string) => boolean): WebKeys => ({
      tabIndex: 0,
      onKeyDown: (event) => {
        if (!owns(event.nativeEvent.key)) return;
        event.preventDefault();
        press.current();
      },
    });
    return {
      pressable: answering((key) => key === ' ' && role !== 'button'),
      view: answering((key) => key === 'Enter' || key === ' '),
    };
  }, [active, role, press]);
}

export { useWebKeys };
