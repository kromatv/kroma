import { NavigatorItem, type NavigatorItemProps } from '@kromatv/spatial-nav/react';
import type { ReactNode } from 'react';
import type { NavigatorItemHostProps } from './navigator-item-host';

/** The face lifts on the browser's single element; natively the lift rides the outer box. */
export const faceLift = (focused: boolean): boolean => focused;

/** A navigator node as ONE element: its style array stays classes and the pointer reaches it directly. */
export function NavigatorItemHost({
  entry,
  onBlur,
  onFocus,
  onLongSelect,
  onSelect,
  painted,
  pointer,
  pressed,
  render,
  viewProps,
}: Readonly<NavigatorItemHostProps>): ReactNode {
  return (
    <NavigatorItem
      ref={entry}
      onSelect={onSelect}
      onLongSelect={onLongSelect}
      onFocus={onFocus}
      onBlur={onBlur}
      style={painted as NavigatorItemProps['style']}
      viewProps={
        {
          ...viewProps,
          onPointerEnter: pointer.onHoverIn,
          onPointerLeave: pointer.onHoverOut,
          onPointerDown: pointer.onPointerDown,
          onPointerUp: pointer.onPointerUp,
          onPointerCancel: pointer.onPointerUp,
        } as NavigatorItemProps['viewProps']
      }
    >
      {(state) => <>{render(state.focused, pressed)}</>}
    </NavigatorItem>
  );
}
