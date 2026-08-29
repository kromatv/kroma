import type { IconName } from '@kroma/ui/kit';
import { Icon, Kbd, Row, Text } from '@kroma/ui/kit';
import { isApplePlatform, type Modifier, modifierLabel } from './shortcut';

export interface ChordProps {
  /** The keys held down, in the order a keyboard prints them. */
  hold: readonly Modifier[];
  /** The key pressed with them, if the chord is a keystroke rather than a
   *  click. */
  press?: string;
  /** What the chord does, drawn after the cap. */
  does?: string;
}

const GLYPH: Record<Modifier, IconName> = {
  ctrl: 'chevron-up',
  alt: 'option',
  shift: 'arrow-big-up-line',
};

const APPLE = isApplePlatform(navigator.platform);
const CAP = 11;

/** The keys every one of the panel's own shortcuts is held with. */
export const HOLD: readonly Modifier[] = ['ctrl', 'alt'];

/** The chord written out, for a control's accessible name. */
export function chordName(press: string): string {
  return HOLD.map((modifier) => modifierLabel(modifier, APPLE)).join(APPLE ? '' : '+') + press;
}

/** One keycap for the whole chord. A Mac prints its modifiers as symbols, and
 *  the mono stack a cap is set in draws each from a different fallback font, so
 *  a symbol is a drawn glyph; the platforms that spell a modifier out keep the
 *  words. */
export function Chord({ hold, press, does }: Readonly<ChordProps>) {
  return (
    <Row align="center" gap={6}>
      <Kbd>
        <Row align="center" gap={3}>
          {APPLE ? (
            hold.map((modifier) => (
              <Icon key={modifier} name={GLYPH[modifier]} size={CAP} color="textMuted" />
            ))
          ) : (
            <Text variant="meta" font="mono" color="textMuted">
              {hold.map((modifier) => `${modifierLabel(modifier, APPLE)}+`).join('')}
            </Text>
          )}
          {press && (
            <Text variant="meta" font="mono" color="textMuted">
              {press}
            </Text>
          )}
        </Row>
      </Kbd>
      {does && (
        <Text variant="meta" color="textMuted">
          {does}
        </Text>
      )}
    </Row>
  );
}
