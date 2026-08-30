import { Animated } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Img } from '#ui/components/atoms/img';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { gradient } from '#ui/lib/css';
import { useT } from '#ui/services/i18n';
import { useRise } from './rise';

/**
 * The film offered once this one is over. Declared here rather than reusing
 * `UpNextItem` because a full-bleed hero wants what a card does not: art at
 * stage width, a rating and a synopsis.
 */
export interface PostPlayItem {
  id: string;
  title: string;
  /** The line under the title: year, runtime, codec, already formatted. */
  subtitle?: string;
  /** Out of ten. Drawn as its own amber mark ahead of {@link subtitle}. */
  rating?: number | null;
  /** Synopsis. Drawn in at most three lines. */
  overview?: string | null;
  /** Wide art, requested at {@link POST_PLAY_ART_W}. */
  artUrl?: string | null;
}

export type PostPlayFocus = 'play' | 'home';

export interface PostPlayProps {
  item: PostPlayItem;
  /** The film that just ended, named at the top so the screen says where the
   *  viewer is before it says where they could go. */
  finished: string;
  /** Which control wears the ring. The player's nav machine owns it, so both
   *  buttons are controlled and neither is a platform focus target. */
  focus: PostPlayFocus;
  /** The stage's width, which is what picks the type tier: this is a page
   *  rather than chrome, so it is typed for three metres or for a desk. */
  stageWidth: number;
  onPlay: () => void;
  onHome: () => void;
}

/** The width the hero is drawn at, and so the width to ask the server for. */
export const POST_PLAY_ART_W = 1920;

// A stage this wide is a television. Below it the same layout is typed for a
// desk, which is the only difference between the two.
const TV_STAGE = 1600;

const TIERS = {
  tv: {
    eyebrow: 'overlineTv',
    title: 'bannerTv',
    meta: 'labelTv',
    mark: 'strongTv',
    overview: 'bodyTv',
    button: 'tv',
    gutter: 80,
    foot: 76,
    head: 56,
    copy: 900,
  },
  desk: {
    eyebrow: 'overline',
    title: 'h1',
    meta: 'label',
    mark: 'label',
    overview: 'body',
    button: 'lg',
    gutter: 56,
    foot: 56,
    head: 36,
    copy: 680,
  },
} as const;

const ART_FILL = 'linear-gradient(135deg, rgba(244,182,66,0.14), rgba(12,12,16,0.98))';
// The copy sits at the foot of the left half, so the art is darkened from that
// corner outwards rather than evenly: a flat scrim over a whole frame reads as
// a dimmed picture instead of a picture with something written on it.
const SCRIM = gradient(
  'linear-gradient(90deg, rgba(8,8,11,0.94) 0%, rgba(8,8,11,0.7) 44%, transparent 80%)',
);
const FLOOR = gradient(
  'linear-gradient(0deg, rgba(8,8,11,0.97) 0%, rgba(8,8,11,0.42) 36%, transparent 64%)',
);
// The one line above the art needs its own ground; the floor below reaches
// nowhere near it.
const CEILING = gradient('linear-gradient(180deg, rgba(8,8,11,0.72) 0%, transparent 20%)');

/**
 * The end of a film (§10): a full screen naming what just finished, offering
 * the next one to watch, and holding the way back to the home screen. It
 * replaces the chrome rather than sitting over it, and it is the only thing the
 * remote can reach while it is up.
 */
export function PostPlay({
  item,
  finished,
  focus,
  stageWidth,
  onPlay,
  onHome,
}: Readonly<PostPlayProps>) {
  const t = useT();
  const tier = stageWidth >= TV_STAGE ? TIERS.tv : TIERS.desk;
  const rise = useRise();
  return (
    <Box fill z={50} bg="#08080b">
      <Animated.View style={[s.art, rise.veil]}>
        {/* Heroes favour the upper third: a backdrop wider than the stage is
            cropped, and what it is cropped towards should be the faces rather
            than the floor the copy is written on. */}
        <Img src={item.artUrl ?? null} background={ART_FILL} position="50% 30%" fill priority />
        <Box fill style={[s.inert, SCRIM]} />
        <Box fill style={[s.inert, FLOOR]} />
        <Box fill style={[s.inert, CEILING]} />
      </Animated.View>

      <Box absolute left={tier.gutter} top={tier.head} right={tier.gutter}>
        <Text lines={1} variant={tier.meta} color="text/50">
          {t('player.finishedWatching', { title: finished })}
        </Text>
      </Box>

      <Animated.View
        style={[
          { position: 'absolute', left: tier.gutter, bottom: tier.foot, maxWidth: tier.copy },
          rise.copy,
        ]}
      >
        <Text variant={tier.eyebrow} color="accentText" mb={12}>
          {t('player.upNextTitle')}
        </Text>
        <Text lines={2} variant={tier.title} mb={12}>
          {item.title}
        </Text>
        {item.rating || item.subtitle ? (
          <Box row align="center" gap={10} mb={12}>
            {item.rating ? (
              <>
                <Text variant={tier.mark} color="accentText">
                  {`${item.rating.toFixed(1)}★`}
                </Text>
                <Text variant={tier.meta} color="textDim">
                  ·
                </Text>
              </>
            ) : null}
            {item.subtitle ? (
              <Text lines={1} variant={tier.meta} color="text/72">
                {item.subtitle}
              </Text>
            ) : null}
          </Box>
        ) : null}
        {item.overview ? (
          <Text lines={3} variant={tier.overview} color="text/64" mb={26}>
            {item.overview}
          </Text>
        ) : null}
        {/* Controlled kit buttons (`focus` is ALWAYS one of them) so neither
            becomes a platform focus target; see ../lib/virtual-focus. */}
        <Box row gap={14}>
          <Button
            variant="primary"
            size={tier.button}
            icon="player-play-filled"
            focused={focus === 'play'}
            onPress={onPlay}
            label={t('player.play')}
          />
          <Button
            variant="glass"
            size={tier.button}
            icon="home"
            focused={focus === 'home'}
            onPress={onHome}
            label={t('nav.home')}
          />
        </Box>
      </Animated.View>
    </Box>
  );
}

const s = styles({
  art: { fill: true },
  inert: { pointerEvents: 'none' },
});
