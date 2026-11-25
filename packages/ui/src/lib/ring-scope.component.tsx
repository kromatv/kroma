import { type ReactNode, useMemo } from 'react';
import { activeTheme, radiusValue } from '#ui/core';
import { useStyleScope } from '#ui/core/style-context';
import { nestedRadius } from '#ui/core/tokens';
import type { CornerValue } from '#ui/core/tokens/layout';
import { MEMBER_INSET, type RingPlacement, RingScopeContext } from './ring-scope';

interface RingScopeProps {
  /** Where every control inside draws its focus ring. */
  placement: RingPlacement;
  /** The container's own corner. A control inside that states none of its own
   *  takes it less `MEMBER_INSET`, so it sits concentric with the container. */
  corner?: CornerValue;
  children?: ReactNode;
}

/**
 * Says, once, where the focus ring of every control in this subtree goes. A
 * container whose members abut or that clips them wraps them in
 * `placement="inside"`, so neither a row nor the button a caller puts beside it
 * has to know what it was placed in.
 */
export function RingScope({ placement, corner, children }: Readonly<RingScopeProps>) {
  const scope = useStyleScope();
  const theme = activeTheme(scope.theme);
  const member =
    corner === undefined
      ? undefined
      : nestedRadius(radiusValue(corner, undefined, theme), MEMBER_INSET);
  const value = useMemo(() => ({ placement, corner: member }), [placement, member]);
  return <RingScopeContext value={value}>{children}</RingScopeContext>;
}
