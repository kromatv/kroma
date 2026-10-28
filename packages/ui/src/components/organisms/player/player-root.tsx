import { type ReactNode } from 'react';
import { type View } from 'react-native';

import { Box } from '#ui/components/atoms/box';
import { Ground } from '#ui/components/atoms/ground';
import { styles } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { PLAYER_ROOT_ID } from './hooks/use-idle-cursor';
import { usePlayerRoot } from './hooks/use-player-root';
import { surfaceShrink } from './lib/surface-shrink';
import { CreditsCard } from './parts/credits-card';
import { PostPlay } from './parts/post-play';
import { ResumePrompt } from './parts/resume-prompt';
import { SettingsPanel } from './parts/settings-panel';
import { SkipIntroButton } from './parts/skip-intro-button';
import { Stage } from './parts/stage';
import { StageFlashView } from './parts/stage-flash';
import { StatsPanel } from './parts/stats-panel';
import { TopBar } from './parts/top-bar';
import { Transport } from './parts/transport';
import { UpNextSheet } from './parts/up-next-sheet';
import { PlayerScope } from './player-parts';
import type { PlayerCloseDetails, PlayerController, PlayerFlags } from './types';

export interface PlayerRootProps {
  controller: PlayerController;
  flags: PlayerFlags;
  /** What is playing, as a name for assistive tech and for the end card. It
   *  draws nothing: `<Player.Title>` is what puts it on screen. */
  title: string;
  /** Default true. False while the player stays mounted out of sight, behind a
   *  picture-in-picture window: it ignores the remote and leaves Back and Menu
   *  to the screen in front. */
  active?: boolean;
  onCast?: () => void;
  onClose: (details: PlayerCloseDetails) => void;
  ref?: React.Ref<View>;
  /** The parts. A `<Player.Media>`, then any of the faces (`Title`, `Subtitle`,
   *  `Warning`, `Actions`, `Panel`) and the settings (`Transport`, `UpNext`,
   *  `Credits`, `PostPlay`, `SkipIntro`, `Resume`, `Subtitles`, `Report`). Only
   *  a DIRECT child takes its slot; anything else is drawn over the chrome, in
   *  the order it was written. */
  children?: ReactNode;
}

/**
 * The unified player chrome (§14): one component for web + TV. The platform
 * provides a {@link PlayerController} and feature flags; nothing here talks to an
 * engine directly. It owns the stage, so give it the whole screen and exactly
 * one `<Player.Media>`.
 */
// Fully destructured, `ref` included: with React 19's ref-as-prop, keeping the
// props bag whole would make every `props.x` read a ref-aggregate access and
// cost the whole chrome its compiler memoisation.
function Root({
  controller,
  flags,
  title,
  active = true,
  onCast,
  onClose,
  ref,
  children,
}: Readonly<PlayerRootProps>) {
  const s = useStyles(sDefinition);

  const {
    c,
    slots,
    upNext,
    nextTitle,
    onPlayNext,
    postPlay,
    appearance,
    onAppearanceChange,
    subtitleGen,
    onReport,
    rawChapters,
    tileAt,
    stageSize,
    onStageLayout,
    statsOn,
    setStatsOn,
    panelRef,
    locked,
    closeFromChrome,
    notice,
    startOver,
    resumeCard,
    intro,
    metrics,
    flash,
    nav,
    credits,
    ending,
    input,
    settingsShrink,
    settings,
    initialView,
    panel,
    onTransportLayout,
    bottomInset,
    introLift,
    sheetOpen,
    peekVisible,
    chromeShown,
    openSheet,
    runOverflow,
    playUpNextItem,
  } = usePlayerRoot({ controller, flags, active, onCast, onClose, children });

  return (
    <PlayerScope>
      <Box
        ref={ref}
        nativeID={PLAYER_ROOT_ID}
        fill
        z={60}
        // Transparent ONLY over a hardware plane, which is behind the page and
        // would be painted out; a surface React lays out sits on this ground.
        bg={surfaceShrink(c.surface) === 'plane' ? 'transparent' : '#000000'}
        onLayout={onStageLayout}
        onPointerMove={input.onPointerMove}
      >
        <Ground tone="dark" flex>
          <Stage
            controller={c}
            stageSize={stageSize}
            settingsShrink={settingsShrink}
            appearance={appearance}
            raised={nav.revealed}
            locked={locked}
            onPress={input.onStagePress}
            onLongPress={input.onStageLongPress}
          >
            {slots.media}
          </Stage>

          <StageFlashView flash={flash} scale={metrics.scale} lift={introLift} />

          {/* skip intro (§13) */}
          {intro ? (
            <SkipIntroButton
              visible={intro.active}
              focused={intro.active && !nav.overlay && !credits.show}
              scale={metrics.scale}
              lift={introLift}
              onSkip={intro.onSkip}
            />
          ) : null}

          {slots.resume ? (
            <ResumePrompt
              at={slots.resume.at}
              title={title}
              art={slots.resume.art}
              shown={notice.shown}
              secondsLeft={notice.secondsLeft}
              total={notice.total}
              focus={nav.overlay ? null : resumeCard.focus}
              scale={metrics.scale}
              lift={introLift}
              onResume={resumeCard.resume}
              onStartOver={startOver}
            />
          ) : null}

          {/* credits autoplay (§11) */}
          {credits.show && nextTitle ? (
            <CreditsCard
              item={nextTitle}
              secondsLeft={credits.secondsLeft}
              total={credits.total}
              playFocused={ending.creditsFocus === 'play'}
              cancelFocused={ending.creditsFocus === 'cancel'}
              scale={metrics.scale}
              onPlay={() => onPlayNext?.()}
              onCancel={credits.cancel}
            />
          ) : null}

          {/* stats (§9) */}
          {statsOn ? <StatsPanel controller={c} onClose={() => setStatsOn(false)} /> : null}

          {/* top bar */}
          <Box
            absolute
            left={0}
            right={0}
            top={0}
            z={20}
            opacity={chromeShown ? 1 : 0}
            style={chromeShown ? s.chromeLive : s.inert}
          >
            <TopBar
              title={slots.title}
              subtitle={slots.subtitle}
              warn={slots.warning}
              actions={slots.actions}
              scale={metrics.scale}
              backFocused={nav.zone === 'back'}
              onBack={closeFromChrome}
            />
          </Box>

          {/* up-next sheet (peek + expand, §10) */}
          <UpNextSheet
            ref={sheetOpen ? panelRef : null}
            data={upNext}
            open={sheetOpen}
            revealed={peekVisible || sheetOpen}
            onOpen={openSheet}
            onClose={nav.closeOverlay}
            onPlay={playUpNextItem}
          />

          <Transport
            controller={c}
            chapters={rawChapters}
            tileAt={tileAt}
            metrics={metrics}
            nav={nav}
            chromeShown={chromeShown}
            bottomInset={bottomInset}
            onLayout={onTransportLayout}
          />

          {/* settings / audio / subtitles panel (§5) */}
          {settings.mounted ? (
            <SettingsPanel
              key={settings.run}
              ref={panelRef}
              shown={settings.shown}
              initialView={initialView}
              width={panel.width}
              covers={panel.covers}
              scale={metrics.scale}
              controller={c}
              appearance={appearance}
              onAppearanceChange={onAppearanceChange}
              statsOn={statsOn}
              onToggleStats={() => setStatsOn((s) => !s)}
              subtitleGen={subtitleGen}
              onReport={onReport}
              overflow={metrics.overflow}
              onControl={runOverflow}
              onClose={() => nav.closeOverlay()}
            />
          ) : null}

          {/* end of the film (§10) */}
          {ending.over && postPlay ? (
            <PostPlay
              item={postPlay}
              finished={title}
              focus={ending.postPlayFocus}
              stageWidth={stageSize.width}
              onPlay={ending.playOffer}
              onHome={ending.goHome}
            />
          ) : null}

          {slots.panel}
          {slots.rest}
        </Ground>
      </Box>
    </PlayerScope>
  );
}

const sDefinition = styles({
  inert: { pointerEvents: 'none' },
  chromeLive: { pointerEvents: 'box-none' },
});

export { Root };
