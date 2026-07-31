// <Toaster>: transient notices, the shadcn/sonner shape. One <Toaster/> is
// mounted by the shell; anything, anywhere, calls `toast(...)`, so the thing
// with something to say never needs to know where notices are drawn.
//
// Written for the ten-foot case first: a notice on a television is read from
// the sofa, is never dismissed by hand, and must never take the remote — so
// it is `pointerEvents="none"`, sized at 10-foot metrics, and leaves on a
// timer. Deliberately not a dialog: nothing here is a question.

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Txt } from '#ui/components/atoms/text';
import { type ColorToken, styles } from '#ui/core';
import { hasGlyph } from '#ui/lib/icons/glyphs';

const DEFAULT_MS = 4500;
// Never stack more than this: a column of notices is a wall, not a message.
const MAX_VISIBLE = 3;

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
}

interface Entry extends ToastOptions {
  id: number;
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
  /** Where notices sit. TVs read top-right, next to the status cluster they are
   * usually about; phones and browsers expect the bottom. */
  placement?: 'top-right' | 'bottom-center';
  /** Inset from the screen edge, in px. The two axes can differ, which a
   * television needs: notices line up with the top bar's gutter but must clear
   * the bar itself. */
  inset?: number | { x?: number; y?: number };
}

/** Mount once, near the root. Draws whatever `toast()` says. */
export function Toaster({ placement = 'top-right', inset = 32 }: Readonly<ToasterProps>) {
  const x = typeof inset === 'number' ? inset : (inset.x ?? 32);
  const y = typeof inset === 'number' ? inset : (inset.y ?? 32);
  const [entries, setEntries] = useState<Entry[]>([]);

  const dismiss = useCallback((id: number) => {
    setEntries((list) => list.filter((e) => e.id !== id));
  }, []);

  useEffect(() => {
    const listener: Listener = (entry) => {
      setEntries((list) => [...list, entry].slice(-MAX_VISIBLE));
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (entries.length === 0) return null;

  const top = placement === 'top-right';
  return (
    <Box
      absolute
      top={top ? y : undefined}
      bottom={top ? undefined : y}
      right={top ? x : undefined}
      left={top ? undefined : 0}
      z={90}
      gap={10}
      align={top ? 'flex-end' : 'center'}
      // A notice never takes the remote, and never eats a tap meant for what is
      // underneath it.
      pointerEvents="none"
      style={top ? undefined : s.fullWidth}
    >
      {entries.map((entry) => (
        <ToastCard key={entry.id} entry={entry} onDone={() => dismiss(entry.id)} />
      ))}
    </Box>
  );
}

function ToastCard({ entry, onDone }: Readonly<{ entry: Entry; onDone: () => void }>) {
  const appear = useRef(new Animated.Value(0)).current;
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
    const stay = setTimeout(() => {
      Animated.timing(appear, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => done.current());
    }, entry.duration ?? DEFAULT_MS);
    return () => clearTimeout(stay);
  }, [appear, entry.duration]);

  return (
    <Animated.View
      style={{
        opacity: appear,
        transform: [
          {
            translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }),
          },
        ],
      }}
    >
      <Box row align="center" gap={14} px={20} py={16} radius="xl" style={s.card}>
        {entry.icon ? (
          // A NAMED glyph gets the kit's well; anything else (an avatar) is
          // already a finished round thing and is drawn as it comes.
          <Box
            w={40}
            h={40}
            center
            radius="pill"
            style={typeof entry.icon === 'string' ? s.well : undefined}
          >
            {typeof entry.icon === 'string' && hasGlyph(entry.icon) ? (
              <Icon name={entry.icon} size={22} stroke={1.9} color={wellTone(entry.tone)} />
            ) : (
              entry.icon
            )}
          </Box>
        ) : null}
        <Box style={s.text}>
          <Txt lines={1} style={s.message}>
            {entry.message}
          </Txt>
          {entry.detail ? (
            <Txt lines={1} style={s.detail} color="textMuted">
              {entry.detail}
            </Txt>
          ) : null}
        </Box>
      </Box>
    </Animated.View>
  );
}

function wellTone(tone: ToastOptions['tone']): ColorToken {
  if (tone === 'success') return 'success';
  if (tone === 'accent') return 'accent';
  return 'text';
}

const s = styles({
  fullWidth: { w: '100%' },
  card: {
    bg: 'overlay',
    border: 'border',
    radius: 'xl',
    maxW: 520,
    // The lift that separates a notice from the picture behind it. Web-only: the
    // native shadow props cost a rasterisation pass a TV does not need to spend.
    ...(Platform.OS === 'web' ? { boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)' } : null),
  },
  well: { bg: 'white/8' },
  text: { minW: 0, shrink: 1 },
  message: { font: 'ui', fontSize: 17, fontWeight: '600' },
  detail: { font: 'ui', fontSize: 14, mt: 2 },
});
