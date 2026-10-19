import { DomOnly } from '#ui/lib/dom-only';
import { TooltipBubble } from './tooltip-bubble';
import type { TooltipProps } from './tooltip-props';

/** A short label over its child on hover or keyboard focus; where there is no pointer the child renders untouched. */
function Tooltip({ label, children }: Readonly<TooltipProps>) {
  return (
    <DomOnly fallback={children}>
      <TooltipBubble label={label}>{children}</TooltipBubble>
    </DomOnly>
  );
}

export type { TooltipProps };
export { Tooltip };
