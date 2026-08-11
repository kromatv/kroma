// The A-Z fast-scroll rail beside a long alphabetical list: a vertical capsule
// of letters whose amber lens covers the stretch currently on screen, with a
// bubble echoing the letter under a scrubbing finger. The lens moves with the
// NavPill's motion: it is the same "lens travels to the current section" idea
// turned vertical.

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  type StyleProp,
  useWindowDimensions,
  type View,
  type ViewStyle,
} from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Txt } from '#ui/components/atoms/text';
import { type StyleDecl, styles, svFor } from '#ui/core';
import { ease } from '#ui/lib/ease';

const WEB = Platform.OS === 'web';

const TRAVEL_MS = 260;
const CHASE_MS = 160;
// Inside the slop a touch is a tap and belongs to the letter's own pressable.
const SCRUB_SLOP = 8;
const PAD = 4;
const ROW_W = 32;
const BUBBLE = 64;
// The lens is the solid accent fill, so a dimmed letter under it keeps its
// ink but drops presence.
const INK_DIM = 'rgba(10, 10, 12, 0.4)';

/** The letters whose sections are on screen right now, first to last: the
 * stretch the lens covers. */
export interface LetterRange {
  first: string;
  last: string;
}

interface LensBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Single short row: the lens tightens to a true circle; any taller stretch
// fills the rail's width as a stadium.
function lensFor(lit: [number, number], rowH: number): LensBox {
  const height = (lit[1] - lit[0] + 1) * rowH;
  const width = Math.min(ROW_W, height);
  return {
    x: PAD + (ROW_W - width) / 2,
    y: PAD + lit[0] * rowH,
    width,
    height,
  };
}

interface Bubble {
  letter: string;
  y: number;
}

const letterVariants = svFor<{ root: StyleDecl; label: StyleDecl }>()({
  slots: {
    root: { align: 'center', justify: 'center', radius: 'pill' },
    label: { font: 'ui', fontWeight: '600' },
  },
  variants: {
    tone: {
      idle: { label: { color: 'textMuted', _hover: { color: 'text' } } },
      dim: { label: { color: 'tint/15' } },
      lit: { label: { color: 'accentInk' } },
      litDim: { label: { color: INK_DIM } },
    },
  },
  defaults: { tone: 'idle' },
});

type Tone = 'idle' | 'dim' | 'lit' | 'litDim';

function toneOf(index: number, present: boolean, lit: [number, number] | null): Tone {
  const inLens = lit !== null && index >= lit[0] && index <= lit[1];
  if (present) return inLens ? 'lit' : 'idle';
  return inLens ? 'litDim' : 'dim';
}

function rangeIndices(
  letters: readonly string[],
  range: LetterRange | undefined,
): [number, number] | null {
  if (!range) return null;
  const first = letters.indexOf(range.first);
  const last = letters.indexOf(range.last);
  if (first < 0 || last < first) return null;
  return [first, last];
}

const clampNum = (min: number, v: number, max: number) => Math.min(max, Math.max(min, v));

interface AlphabetRailProps {
  /** Every bucket in rail order (for the catalogue: '#', 'A' … 'Z'). */
  letters: readonly string[];
  /** Buckets present in the list. The rest render dimmed, and a scrub or tap
   *  near one snaps to the nearest present bucket. */
  available: ReadonlySet<string>;
  /** The stretch of buckets whose sections are on screen: where the lens sits. */
  range?: LetterRange;
  onJump: (letter: string) => void;
  /** Accessible name of the rail. */
  label: string;
  /** Accessible name of one letter's button. */
  letterLabel: (letter: string) => string;
  style?: StyleProp<ViewStyle>;
}

/** The vertical sibling of the NavPill: a glass capsule of letters, an amber
 * lens over the letters on screen, and (under a finger or pointer drag) a
 * bubble naming the letter being scrubbed to. The host owns the list and the
 * scroll; the rail only reports jumps. */
function AlphabetRail({
  letters,
  available,
  range,
  onJump,
  label,
  letterLabel,
  style,
}: Readonly<AlphabetRailProps>) {
  // Rows scale with the viewport so the full alphabet always fits, capped
  // where the letters stop gaining legibility.
  const { height: winH } = useWindowDimensions();
  const rowH = Math.round(clampNum(19, winH * 0.03, 31));
  const fontSize = Math.round(clampNum(12, winH * 0.019, 17));

  const [bubble, setBubble] = useState<Bubble | null>(null);
  const rail = useRef<View>(null);

  // The responder outlives every render, so it reads the moving parts
  // through refs rather than closures.
  const frame = useRef({ letters, available, rowH });
  frame.current = { letters, available, rowH };
  const jump = useRef(onJump);
  jump.current = onJump;
  const scrubbed = useRef<string | null>(null);
  const originY = useRef<number | null>(null);

  // offsetY is measured from the rail's top edge.
  const scrubAt = (offsetY: number) => {
    const { letters: all, available: present, rowH: row } = frame.current;
    if (present.size === 0) return;
    const at = clampNum(0, Math.floor((offsetY - PAD) / row), all.length - 1);
    let best = -1;
    let gap = Number.POSITIVE_INFINITY;
    all.forEach((letter, i) => {
      const away = Math.abs(i - at);
      if (present.has(letter) && away < gap) {
        gap = away;
        best = i;
      }
    });
    if (best < 0) return;
    const letter = all[best];
    if (letter === undefined) return;
    setBubble({ letter, y: PAD + best * row + row / 2 });
    if (scrubbed.current !== letter) {
      scrubbed.current = letter;
      jump.current(letter);
    }
  };
  const scrubAtRef = useRef(scrubAt);
  scrubAtRef.current = scrubAt;

  // Web scrubbing goes straight to DOM pointer events: react-native-web's
  // responder system does not follow a mouse drag, and preventDefault on the
  // press is also what keeps a scrub from selecting letters or focusing them.
  useEffect(() => {
    if (!WEB) return;
    const node = rail.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const end = () => {
      scrubbed.current = null;
      setBubble(null);
    };
    const down = (e: PointerEvent) => {
      e.preventDefault();
      node.setPointerCapture(e.pointerId);
      scrubAtRef.current(e.clientY - node.getBoundingClientRect().top);
    };
    const move = (e: PointerEvent) => {
      if (e.buttons === 0) return;
      scrubAtRef.current(e.clientY - node.getBoundingClientRect().top);
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
    return () => {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', end);
      node.removeEventListener('pointercancel', end);
    };
  }, []);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        Math.abs(gesture.dy) > SCRUB_SLOP && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        originY.current = null;
        const node = rail.current as
          | (View & { getBoundingClientRect?: () => { top: number } })
          | null;
        if (node?.getBoundingClientRect) {
          const scrollY = (globalThis as { scrollY?: number }).scrollY ?? 0;
          originY.current = node.getBoundingClientRect().top + scrollY;
        } else {
          node?.measureInWindow((_x, y) => {
            originY.current = y;
          });
        }
      },
      onPanResponderMove: (_event, gesture) => {
        if (originY.current === null) return;
        scrubAtRef.current(gesture.moveY - originY.current);
      },
      // Once a scrub owns the touch, no ancestor scroll view takes it back.
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: () => {
        scrubbed.current = null;
        setBubble(null);
      },
      onPanResponderTerminate: () => {
        scrubbed.current = null;
        setBubble(null);
      },
    }),
  ).current;

  const lit = rangeIndices(letters, range);
  const lens = lit ? lensFor(lit, rowH) : null;

  return (
    <Box
      ref={rail}
      {...(WEB || Platform.isTV ? null : pan.panHandlers)}
      accessibilityLabel={label}
      radius="pill"
      border="borderStrong"
      bg="surface1/78"
      p={PAD}
      style={style}
    >
      <Lens box={lens} chase={bubble !== null} />
      {letters.map((letter, index) => {
        const tone = toneOf(index, available.has(letter), lit);
        return available.has(letter) ? (
          <Focusable
            key={letter}
            label={letterLabel(letter)}
            onPress={() => onJump(letter)}
            sv={letterVariants}
            vars={{ tone }}
            style={{ width: ROW_W, height: rowH }}
          >
            {(state) => (
              <Txt selectable={false} style={[state.slots.label, { fontSize }]}>
                {letter}
              </Txt>
            )}
          </Focusable>
        ) : (
          <Box key={letter} align="center" justify="center" style={{ width: ROW_W, height: rowH }}>
            <Txt
              aria-hidden
              selectable={false}
              style={[letterVariants({ tone }).label, { fontSize }]}
            >
              {letter}
            </Txt>
          </Box>
        );
      })}
      {bubble ? (
        <Box
          absolute
          align="center"
          justify="center"
          bg="accent"
          radius="2xl"
          style={{
            right: ROW_W + PAD * 2 + 18,
            top: bubble.y - BUBBLE / 2,
            width: BUBBLE,
            height: BUBBLE,
          }}
        >
          <Txt selectable={false} variant="h1" color="accentInk" style={{ fontSize: 30 }}>
            {bubble.letter}
          </Txt>
        </Box>
      ) : null}
    </Box>
  );
}

function Lens({ box, chase }: Readonly<{ box: LensBox | null; chase: boolean }>) {
  if (WEB) return <WebLens box={box} chase={chase} />;
  return <NativeLens box={box} chase={chase} />;
}

function WebLens({ box, chase }: Readonly<{ box: LensBox | null; chase: boolean }>) {
  // The first box is taken without a transition: a lens animating in from
  // nowhere on mount would be an entrance nobody staged.
  const placed = useRef(false);
  const had = placed.current;
  if (box) placed.current = true;
  const last = useRef<LensBox | null>(null);
  if (box) last.current = box;
  const shown = box ?? last.current;
  if (!shown) return null;
  return (
    <Box
      absolute
      radius="pill"
      bg="accent"
      style={
        {
          left: shown.x,
          top: shown.y,
          width: shown.width,
          height: shown.height,
          opacity: box ? 1 : 0,
          transitionProperty: had ? 'left, top, width, height, opacity' : 'opacity',
          transitionDuration: `${chase ? CHASE_MS : TRAVEL_MS}ms`,
          transitionTimingFunction: ease.spring.css,
        } as ViewStyle
      }
    />
  );
}

function NativeLens({ box, chase }: Readonly<{ box: LensBox | null; chase: boolean }>) {
  const left = useRef(new Animated.Value(0)).current;
  const top = useRef(new Animated.Value(0)).current;
  const width = useRef(new Animated.Value(0)).current;
  const height = useRef(new Animated.Value(0)).current;
  const shown = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  const last = useRef<LensBox | null>(null);
  if (box) last.current = box;

  useEffect(() => {
    if (box && !placed.current) {
      placed.current = true;
      left.setValue(box.x);
      top.setValue(box.y);
      width.setValue(box.width);
      height.setValue(box.height);
      shown.setValue(1);
      return;
    }
    const eased = {
      duration: chase ? CHASE_MS : TRAVEL_MS,
      easing: ease.spring.native,
      useNativeDriver: false,
    } as const;
    if (box) {
      Animated.parallel([
        Animated.timing(left, { toValue: box.x, ...eased }),
        Animated.timing(top, { toValue: box.y, ...eased }),
        Animated.timing(width, { toValue: box.width, ...eased }),
        Animated.timing(height, { toValue: box.height, ...eased }),
        Animated.timing(shown, { toValue: 1, ...eased }),
      ]).start();
      return;
    }
    Animated.timing(shown, { toValue: 0, ...eased }).start();
  }, [box, chase, left, top, width, height, shown]);

  if (!last.current && !box) return null;
  return <Animated.View style={[s.lens, { left, top, width, height, opacity: shown }]} />;
}

const s = styles({
  lens: { absolute: true, radius: 'pill', bg: 'accent' },
});

export type { AlphabetRailProps };
export { AlphabetRail };
