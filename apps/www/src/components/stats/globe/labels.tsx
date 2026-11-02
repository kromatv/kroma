import type { RefObject } from 'react';
import type { PlacedPin } from './model';

/** How far a pill hangs from its pin when nothing is in the way. */
export const STEM_PX = 14;

/** One label as the projector moves it: the column it positions, the pill it
 * nudges sideways, the stem it stretches, and the pill's size, measured once so
 * a frame never reads layout. */
export interface LabelNode {
  node: HTMLElement;
  pill: HTMLElement;
  stem: HTMLElement;
  width: number;
  height: number;
}

export interface LabelsProps {
  pins: readonly PlacedPin[];
  named: number;
  nodes: RefObject<Map<string, LabelNode>>;
}

function measure(node: HTMLElement): LabelNode | null {
  const [pill, stem] = node.children;
  if (!(pill instanceof HTMLElement) || !(stem instanceof HTMLElement)) return null;
  return { node, pill, stem, width: pill.offsetWidth, height: pill.offsetHeight };
}

/** The pill over each pinned country, laid over the canvas. Positioned by
 * `LabelProjector`; until its first frame each one is invisible at the origin. */
export function Labels({ pins, named, nodes }: Readonly<LabelsProps>) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {pins.map((pin, i) => (
        <div
          key={pin.code}
          ref={(node) => {
            const measured = node && measure(node);
            if (!measured) return;
            nodes.current.set(pin.code, measured);
            return () => {
              nodes.current.delete(pin.code);
            };
          }}
          className="absolute left-0 top-0 flex flex-col items-center will-change-transform"
          style={{ zIndex: pins.length - i, opacity: 0 }}
        >
          <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface-1/95 py-1 pr-2.5 pl-2 font-sans text-xs font-semibold text-text shadow-pop backdrop-blur-sm">
            {pin.flag && (
              <img
                src={pin.flag}
                alt=""
                aria-hidden
                width={18}
                height={12}
                className="h-3 w-[18px] rounded-[2px] object-cover"
              />
            )}
            {(i < named || !pin.flag) && pin.label}
            <span className="font-medium text-dim tabular-nums">{pin.n}</span>
          </span>
          <span className="w-px bg-border-strong" style={{ height: STEM_PX }} />
        </div>
      ))}
    </div>
  );
}
