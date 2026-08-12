import type { GenQuality, SubCapabilities } from '@kroma/core';
import { GEN_LANGS, GEN_QUALITIES } from '@kroma/core';
import { forwardRef, useImperativeHandle, useState } from 'react';
import { Pressable, type ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { IconButton } from '#ui/components/atoms/icon-button';
import { Text } from '#ui/components/atoms/text';
import { useListFocus } from '#ui/components/organisms/player/hooks/use-list-focus';
import type { PanelHandle } from '#ui/components/organisms/player/lib/nav';

import { VIRTUAL_FOCUS } from '#ui/components/organisms/player/lib/virtual-focus';
import type { PlayerSub } from '#ui/components/organisms/player/types';
import { type ColorValue, sharedStyle, styles } from '#ui/core';
import { gradient } from '#ui/lib/css';
import { useT } from '#ui/services/i18n';
import type { SubtitleGenRequest } from './gen';
import { panel } from './panel-style';
import { CycleField } from './wizard-parts';

type Mode = 'transcribe' | 'translate';

interface GenerateWizardProps {
  caps: SubCapabilities | null;
  sources: PlayerSub[];
  onStart: (req: SubtitleGenRequest) => void;
  onClose: () => void;
}

/** One focusable wizard field, in display order for the current mode. */
interface Field {
  key: 'mode' | 'lang' | 'quality' | 'source' | 'start';
  nudge?: (dir: -1 | 1) => void;
  activate?: () => void;
}

const mod = (n: number, m: number) => ((n % m) + m) % m;

/**
 * The on-device subtitle-generation form (§5), prop-driven so @kroma/ui stays
 * client-agnostic. Mode tabs pick transcribe (Whisper) / translate (LLM); ▲▼ move
 * between cycle fields, ◀▶ change the focused field, OK on the last row emits a
 * {@link SubtitleGenRequest} and closes. Modes are gated by `caps`.
 */
export const GenerateWizard = forwardRef<PanelHandle, GenerateWizardProps>(function GenerateWizard(
  { caps, sources, onStart, onClose },
  ref,
) {
  const t = useT();
  const [mode, setMode] = useState<Mode>(caps?.transcribe ? 'transcribe' : 'translate');
  const [langIndex, setLangIndex] = useState(0);
  const [quality, setQuality] = useState<GenQuality>('balanced');
  const [sourceIndex, setSourceIndex] = useState(0);

  const qualityLabel = (q: GenQuality) => {
    if (q === 'fast') return t('player.subQualityFast');
    if (q === 'accurate') return t('player.subQualityAccurate');
    return t('player.subQualityBalanced');
  };
  const sourceLabel = (s: PlayerSub) =>
    s.label ||
    (s.language ?? '').toUpperCase() ||
    t('player.subtitleTrack', { number: s.index + 1 });

  const toggleMode = () => {
    if (caps?.transcribe && caps?.translate) {
      setMode((m) => (m === 'transcribe' ? 'translate' : 'transcribe'));
    }
  };
  const start = () => {
    if (mode === 'transcribe') {
      const lang = GEN_LANGS[langIndex] ?? GEN_LANGS[0];
      onStart({ mode: 'transcribe', lang: lang?.code, quality });
    } else {
      const src = sources[sourceIndex];
      if (!src) return;
      onStart({ mode: 'translate', sourceIndex: src.index });
    }
    onClose();
  };

  const cycleLang = (d: -1 | 1) => setLangIndex((i) => mod(i + d, GEN_LANGS.length));
  const cycleQuality = (d: -1 | 1) =>
    setQuality((q) => GEN_QUALITIES[mod(GEN_QUALITIES.indexOf(q) + d, GEN_QUALITIES.length)] ?? q);
  const cycleSource = (d: -1 | 1) =>
    setSourceIndex((i) => (sources.length ? mod(i + d, sources.length) : 0));

  const fields: Field[] =
    mode === 'transcribe'
      ? [
          { key: 'mode', nudge: toggleMode },
          { key: 'lang', nudge: cycleLang },
          { key: 'quality', nudge: cycleQuality },
          { key: 'start', activate: start },
        ]
      : [
          { key: 'mode', nudge: toggleMode },
          { key: 'source', nudge: cycleSource },
          { key: 'start', activate: start },
        ];
  const at = (key: Field['key']) => fields.findIndex((f) => f.key === key);

  const focus = useListFocus({
    count: fields.length,
    onActivate: (i) => fields[i]?.activate?.(),
    onHorizontal: (i, d) => fields[i]?.nudge?.(d),
    onBack: onClose,
  });
  useImperativeHandle(ref, () => ({ onKey: focus.onKey }), [focus.onKey]);

  const curSource = sources[sourceIndex] ?? sources[0];
  const curLang = GEN_LANGS[langIndex] ?? GEN_LANGS[0];
  const noSource = mode === 'translate' && sources.length === 0;

  return (
    <Box
      radius="2xl"
      borderWidth={1}
      border="rgba(124, 92, 255, 0.34)"
      p={32}
      style={gradient('linear-gradient(180deg, rgba(124,92,255,0.1), rgba(124,92,255,0.02))')}
    >
      <Box row align="center" between gap={16} mb={24}>
        <Text variant="subheadingTv">{t('player.subGenerate')}</Text>
        {/* Pointer-only close: controlled at `false` so it never becomes a
            platform focus target (see ../../lib/virtual-focus.ts); not in the
            field list. */}
        <IconButton
          variant="glass"
          size={36}
          icon="x"
          glyph={17}
          focused={false}
          onPress={onClose}
          label={t('player.subGenClose')}
        />
      </Box>

      {/* mode tabs (index 0): ◀▶ toggles, a press picks directly. */}
      <Box
        row
        gap={10}
        mb={14}
        radius="lg"
        onPointerEnter={focus.hover(0)}
        style={
          focus.index === 0 ? sharedStyle('generate-wizard:tabs-ring', { ring: 'focusLift' }) : null
        }
      >
        <ModeTab
          on={mode === 'transcribe'}
          enabled={Boolean(caps?.transcribe)}
          label={t('player.subModeTranscribe')}
          hint={t('player.subModeTranscribeHint')}
          onPress={() => caps?.transcribe && setMode('transcribe')}
        />
        <ModeTab
          on={mode === 'translate'}
          enabled={Boolean(caps?.translate)}
          label={t('player.subModeTranslate')}
          hint={t('player.subModeTranslateHint')}
          onPress={() => caps?.translate && setMode('translate')}
        />
      </Box>

      <Box gap={12}>
        {mode === 'translate' && curSource != null ? (
          <CycleField
            label={t('player.subSource')}
            value={sourceLabel(curSource)}
            focused={focus.index === at('source')}
            onFocus={focus.hover(at('source'))}
            onDec={() => cycleSource(-1)}
            onInc={() => cycleSource(1)}
          />
        ) : null}
        {mode === 'translate' && curSource == null ? (
          <Text style={panel.panelEmpty}>{t('player.subNoSource')}</Text>
        ) : null}
        {mode === 'transcribe' ? (
          <>
            <CycleField
              label={t('player.subSpokenLang')}
              value={curLang?.label ?? ''}
              focused={focus.index === at('lang')}
              onFocus={focus.hover(at('lang'))}
              onDec={() => cycleLang(-1)}
              onInc={() => cycleLang(1)}
            />
            <CycleField
              label={t('player.subQuality')}
              value={qualityLabel(quality)}
              focused={focus.index === at('quality')}
              onFocus={focus.hover(at('quality'))}
              onDec={() => cycleQuality(-1)}
              onInc={() => cycleQuality(1)}
            />
          </>
        ) : null}
      </Box>

      <Text style={s.backgroundHint} color="text/40">
        {t('player.subGenBackground')}
      </Text>

      {/* Controlled kit button (`focused` is ALWAYS passed - the wizard's own
          list focus drives it; see ../../lib/virtual-focus.ts). */}
      <Button
        block
        variant="primary"
        size="tv"
        icon="sparkles"
        label={t('player.subGenStart')}
        focused={focus.index === at('start')}
        disabled={noSource}
        onHoverIn={focus.hover(at('start'))}
        onPress={start}
        style={s.startButton}
      />
    </Box>
  );
});

const s = styles({
  startButton: { mt: 4 },
  backgroundHint: { mx: 2, mt: 12, mb: 4, text: 'captionTv' },
  modeTab: { flex: 1, radius: 'lg', px: 18, py: 14 },
  modeHint: { opacity: 0.75 },
  modeDisabled: { bg: 'tint/4' },
  modeOn: { bg: 'accent' },
  modeOff: { bg: 'tint/5' },
});

function ModeTab({
  on,
  enabled,
  label,
  hint,
  onPress,
}: Readonly<{ on: boolean; enabled: boolean; label: string; hint: string; onPress: () => void }>) {
  const tone = modeTone(enabled, on);
  return (
    <Pressable
      {...VIRTUAL_FOCUS}
      onPress={enabled ? onPress : undefined}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled: !enabled }}
      style={[s.modeTab, tone.box]}
    >
      <Text variant="strongTv" color={tone.ink}>
        {label}
      </Text>
      <Text variant="footnoteTv" style={s.modeHint} color={tone.ink}>
        {hint}
      </Text>
    </Pressable>
  );
}

function modeTone(enabled: boolean, on: boolean): { box: ViewStyle; ink: ColorValue } {
  if (!enabled) return { box: s.modeDisabled, ink: 'text/40' };
  if (on) return { box: s.modeOn, ink: 'accentInk' };
  return { box: s.modeOff, ink: 'text/75' };
}
