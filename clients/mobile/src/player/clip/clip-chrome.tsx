import { useT } from '#mobile/lib/i18n';
import { type ChromeFrame, ChromeSurface } from '#mobile/player/chrome/chrome-surface';
import { ControlsFrame, RowShortcut } from '#mobile/player/chrome/controls-frame';
import { PortraitControls } from '#mobile/player/chrome/portrait-controls';
import type { Transport } from '#mobile/player/engine';

/** The phone player's chrome over a clip: the film's surface, transport and
 * scrub bar, with only picture in picture and the way out of fullscreen under
 * it. */
export function ClipChrome({
  clip,
  title,
  subtitle,
  fill,
  onZoom,
  notice,
  compact,
  onBack,
  onPip,
  onFullscreen,
}: Readonly<{
  clip: Transport;
  title: string;
  subtitle?: string;
  fill: boolean;
  onZoom(fill: boolean): void;
  notice?: string | null;
  compact: boolean;
  onBack(): void;
  onPip(): void;
  onFullscreen(): void;
}>) {
  const t = useT();
  const controls = (frame: ChromeFrame) => {
    if (!frame.visible) return null;
    if (compact) return <PortraitControls engine={clip} poke={frame.poke} />;
    return (
      <ControlsFrame
        engine={clip}
        title={title}
        subtitle={subtitle}
        insets={frame.insets}
        poke={frame.poke}
        hold={frame.hold}
        onBack={onBack}
        onBarLayout={frame.onBarLayout}
        end={
          <>
            <RowShortcut
              icon="picture-in-picture"
              label={t('player.pip')}
              onPress={() => {
                onPip();
                frame.poke();
              }}
            />
            <RowShortcut
              icon="minimize"
              label={t('player.exitFullscreen')}
              onPress={onFullscreen}
            />
          </>
        }
      />
    );
  };
  return (
    <ChromeSurface engine={clip} fill={fill} onZoom={onZoom} notice={notice} compact={compact}>
      {controls}
    </ChromeSurface>
  );
}
