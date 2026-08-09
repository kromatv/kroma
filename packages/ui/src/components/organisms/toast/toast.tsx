// <Toaster>: transient notices, the shadcn/sonner shape. One <Toaster/> is
// mounted by the shell; anything, anywhere, calls `toast(...)`, so the thing
// with something to say never needs to know where notices are drawn.
//
// Written for the ten-foot case first: a notice on a television is read from
// the sofa, is never dismissed by hand, and must never take the remote, so it
// is `pointerEvents: 'none'`, sized at 10-foot metrics, and leaves on a timer.
// Deliberately not a dialog: nothing here is a question.

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import type { ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import type { IconName } from '#ui/components/atoms/icon';
import { ToastCard } from './toast-card';

const DEFAULT_MS = 4500;
// Never stack more than this per corner: a column of notices is a wall, not a
// message. Counted per corner, so a notice at the bottom cannot evict one the
// viewer is still reading at the top.
const MAX_VISIBLE = 3;
const DEFAULT_INSET = 32;
const SLIDE = 8;

export type ToastPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

const DEFAULT_POSITION: ToastPosition = 'top-right';

const NO_POINTER: ViewStyle = { pointerEvents: 'none' };

const COLUMNS = {
  'top-left': { top: true, align: 'flex-start' },
  'top-center': { top: true, align: 'center' },
  'top-right': { top: true, align: 'flex-end' },
  'bottom-left': { top: false, align: 'flex-start' },
  'bottom-center': { top: false, align: 'center' },
  'bottom-right': { top: false, align: 'flex-end' },
} as const satisfies Record<
  ToastPosition,
  { top: boolean; align: 'flex-start' | 'center' | 'flex-end' }
>;

export interface ToastOptions {
  /** The line to read. Already translated - the kit does not know your catalog. */
  message: string;
  /** A quieter second line: who, or what for. */
  detail?: string;
  /** What sits in the leading well: a glyph by name, or a node - an <Avatar>,
   *  say, when the notice is about a PERSON rather than an event.
   *
   *  The node half excludes bare strings on purpose. `ReactNode` admits them,
   *  which swallowed `IconName` into it (every glyph name IS a string) and left
   *  the union meaning nothing more than `ReactNode` - no autocomplete, and a
   *  typo'd glyph name rendered as literal text in the well instead of failing
   *  to compile. */
  icon?: IconName | Exclude<ReactNode, string>;
  /** Milliseconds on screen. Defaults to {@link DEFAULT_MS}. */
  duration?: number;
  /** `success` tints the well; `plain` is the default neutral. */
  tone?: 'plain' | 'success' | 'accent';
  /** Beats the <Toaster/>'s own, for the one notice that belongs somewhere
   *  else. Read when the notice appears and kept: a notice never moves under
   *  a viewer who is reading it. */
  position?: ToastPosition;
}

interface Entry extends ToastOptions {
  id: number;
}

interface Placed extends Entry {
  at: ToastPosition;
}

type Listener = (entry: Entry) => void;

const listeners = new Set<Listener>();
let nextId = 1;

/**
 * Say something. No-op when no <Toaster/> is mounted, so a shell that has not
 * opted in simply stays quiet instead of throwing at the call site.
 */
export function toast(options: ToastOptions): void {
  const entry: Entry = { id: nextId++, ...options };
  for (const listener of listeners) listener(entry);
}

export interface ToasterProps {
  /** Where notices sit unless one names its own. TVs read top-right, next to
   * the status cluster they are usually about; phones and browsers expect the
   * bottom. */
  position?: ToastPosition;
  /** Inset from the screen edge, in px. The edges can differ, which both form
   * factors need: a television lines its notices up with the top bar's gutter
   * but must clear the bar itself, and a phone's notch is not its home
   * indicator (React Native reports neither, so a phone shell passes its own
   * safe-area insets here, or mounts the host inside its safe frame). */
  inset?: number | { x?: number; y?: number; top?: number; bottom?: number };
}

interface Gutters {
  x: number;
  top: number;
  bottom: number;
}

/**
 * Mount once, as a child of the view that IS the screen: the host is a
 * full-bleed layer over its parent, so it pins to the viewport in an app and
 * stays inside the stage in the workbench, with no window portal either way.
 */
export function Toaster({
  position = DEFAULT_POSITION,
  inset = DEFAULT_INSET,
}: Readonly<ToasterProps>) {
  const gutters = resolveInset(inset);
  const [entries, setEntries] = useState<Placed[]>([]);
  // Through a ref, and resolved once into the entry: the host's position is
  // what a notice is BORN with, not something it keeps reading.
  const fallback = useRef(position);
  fallback.current = position;

  const dismiss = useCallback((id: number) => {
    setEntries((list) => list.filter((e) => e.id !== id));
  }, []);

  useEffect(() => {
    const listener: Listener = (entry) => {
      const at = entry.position ?? fallback.current;
      setEntries((list) => capped([...list, { ...entry, at }], at));
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // The (empty) layer stays mounted: a live region only announces changes
  // INSIDE an element assistive tech already knows about, so mounting it
  // together with the first notice would swallow that notice.
  return (
    <Box
      fill
      z={90}
      // A notice never takes the remote, and never eats a tap meant for what is
      // underneath it.
      style={NO_POINTER}
      // A live region, so a screen reader announces a notice when it appears
      // instead of the viewer having to stumble on it.
      accessibilityLiveRegion="polite"
    >
      {[...byPosition(entries)].map(([at, column]) => (
        <ToastColumn key={at} at={at} entries={column} gutters={gutters} onDone={dismiss} />
      ))}
    </Box>
  );
}

function resolveInset(inset: NonNullable<ToasterProps['inset']>): Gutters {
  if (typeof inset === 'number') return { x: inset, top: inset, bottom: inset };
  const y = inset.y ?? DEFAULT_INSET;
  return { x: inset.x ?? DEFAULT_INSET, top: inset.top ?? y, bottom: inset.bottom ?? y };
}

function capped(list: readonly Placed[], at: ToastPosition): Placed[] {
  const column = list.filter((entry) => entry.at === at);
  const over = column.length - MAX_VISIBLE;
  if (over <= 0) return [...list];
  const evicted = new Set(column.slice(0, over).map((entry) => entry.id));
  return list.filter((entry) => !evicted.has(entry.id));
}

function byPosition(entries: readonly Placed[]): Map<ToastPosition, Placed[]> {
  const columns = new Map<ToastPosition, Placed[]>();
  for (const entry of entries) {
    const column = columns.get(entry.at);
    if (column) column.push(entry);
    else columns.set(entry.at, [entry]);
  }
  return columns;
}

function ToastColumn({
  at,
  entries,
  gutters,
  onDone,
}: Readonly<{
  at: ToastPosition;
  entries: readonly Placed[];
  gutters: Gutters;
  onDone: (id: number) => void;
}>) {
  const { top, align } = COLUMNS[at];
  // Newest nearest the edge. A top column is anchored at the top and grows
  // down, so the newest is drawn FIRST; a bottom one grows up from its anchor,
  // so it is drawn last and the two read as mirrors.
  const order = top ? [...entries].reverse() : entries;
  return (
    <Box
      absolute
      top={top ? gutters.top : undefined}
      bottom={top ? undefined : gutters.bottom}
      left={gutters.x}
      right={gutters.x}
      gap={10}
      align={align}
    >
      {order.map((entry) => (
        <ToastCard
          key={entry.id}
          entry={entry}
          stay={entry.duration ?? DEFAULT_MS}
          from={top ? -SLIDE : SLIDE}
          onDone={() => onDone(entry.id)}
        />
      ))}
    </Box>
  );
}
