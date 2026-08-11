import type { RemoteKey, SubtitleGeneration } from '@kroma/core';
import { langName, subtitleEtaTime, subtitleStageKey } from '@kroma/core';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { IconButton } from '#ui/components/atoms/icon-button';
import { Progress } from '#ui/components/atoms/progress';
import { Txt } from '#ui/components/atoms/text';
import { useListFocus } from '#ui/components/organisms/player/hooks/useListFocus';
import type { PanelHandle } from '#ui/components/organisms/player/lib/nav';
import { IconAi } from '#ui/components/organisms/player/parts/icons';
import type { PlayerSub } from '#ui/components/organisms/player/types';
import { styles } from '#ui/core';
import { useT } from '#ui/services/i18n';
import { GenerateWizard } from './GenerateWizard';
import type { SubtitleGenBundle } from './gen';
import { panel } from './panelStyle';
import { SelectRow } from './select-row';

interface SubtitlesPanelProps {
  subs: PlayerSub[];
  current: number | null;
  onSelect: (index: number | null) => void;
  gen: SubtitleGenBundle;
  onBack: () => void;
}

/**
 * Subtitle picker (§5): an "Off" row, the embedded / downloaded tracks (AI tracks
 * carry a violet "IA" badge + a delete control), the live generation rows, and a
 * "create missing" row (leading sparkle) that opens the {@link GenerateWizard}
 * inline. Selecting a track returns to the menu; the wizard captures the D-pad.
 */
export const SubtitlesPanel = forwardRef<PanelHandle, SubtitlesPanelProps>(function SubtitlesPanel(
  { subs, current, onSelect, gen, onBack },
  ref,
) {
  const t = useT();
  const [wizardOpen, setWizardOpen] = useState(false);
  const wizardRef = useRef<PanelHandle>(null);
  const sources = subs.filter((s) => s.url);

  // Focus flow: [Off, ...subs, (create row?)]. Gen rows are informational.
  const rowCount = 1 + subs.length + (gen.canCreate ? 1 : 0);
  const createIndex = gen.canCreate ? rowCount - 1 : -1;

  const activate = (i: number) => {
    if (i === 0) {
      onSelect(null);
      onBack();
      return;
    }
    if (i === createIndex) {
      setWizardOpen(true);
      return;
    }
    const s = subs[i - 1];
    if (s?.selectable) {
      onSelect(s.index);
      onBack();
    }
  };

  const focus = useListFocus({ count: rowCount, onActivate: activate, onBack });
  useImperativeHandle(
    ref,
    () => ({
      onKey: (k: RemoteKey) => (wizardOpen ? Boolean(wizardRef.current?.onKey(k)) : focus.onKey(k)),
    }),
    [wizardOpen, focus.onKey],
  );

  return (
    <Box>
      <Box style={panel.panelList}>
        <SelectRow
          label={t('player.subtitlesOff')}
          selected={current == null}
          focused={focus.index === 0}
          onActivate={() => activate(0)}
          onFocus={focus.hover(0)}
        />
        {subs.map((s, i) => {
          const codec = s.codec.toUpperCase();
          // A picture sub cannot be rendered as text, so its row is inert and
          // reads as such rather than being hidden (the track does exist).
          const row = (
            <Box
              flex={s.ai && s.subId ? 1 : undefined}
              style={{ minWidth: 0 }}
              opacity={s.selectable ? 1 : 0.4}
            >
              <SelectRow
                label={
                  s.ai && s.label ? s.label : langName(t, s.language) || t('player.langUnknown')
                }
                sub={s.selectable ? codec : `${codec} · ${t('player.pictureSub')}`}
                trailing={s.ai ? <AiBadge /> : null}
                selected={current === s.index}
                focused={focus.index === i + 1}
                onActivate={() => (s.selectable ? activate(i + 1) : undefined)}
                onFocus={focus.hover(i + 1)}
              />
            </Box>
          );
          // A generated track pairs its row with a delete control; everything
          // else is the row alone. The key belongs to whichever element this
          // branch returns.
          if (s.ai && s.subId) {
            return (
              <Box key={s.index} row align="center" gap={8}>
                {row}
                <TrashButton
                  label={t('player.subGenDelete')}
                  onPress={() => gen.onDelete(s.subId as string)}
                />
              </Box>
            );
          }
          return <Box key={s.index}>{row}</Box>;
        })}
        {gen.pending.map((g) => (
          <GenRow key={g.id} gen={g} onCancel={() => gen.onCancel(g.id)} />
        ))}
        {gen.canCreate && !wizardOpen ? (
          <SelectRow
            leading={<IconAi size={22} />}
            label={t('player.subCreateMissing')}
            focused={focus.index === createIndex}
            onActivate={() => setWizardOpen(true)}
            onFocus={focus.hover(createIndex)}
          />
        ) : null}
      </Box>

      {gen.canCreate && wizardOpen ? (
        <Box mt={12}>
          <GenerateWizard
            ref={wizardRef}
            caps={gen.caps}
            sources={sources}
            onStart={gen.onStart}
            onClose={() => setWizardOpen(false)}
          />
        </Box>
      ) : null}
    </Box>
  );
});

function AiBadge() {
  return (
    <Box
      row
      align="center"
      gap={4}
      shrink={0}
      radius="xs"
      px={6}
      py={2}
      bg="rgba(124, 92, 255, 0.18)"
    >
      <IconAi size={11} color="#B7A6FF" />
      <Txt style={s.aiBadgeLabel}>IA</Txt>
    </Box>
  );
}

// Pointer-only, controlled at `false`: never a platform focus target (see
// ../../lib/virtual-focus.ts).
function TrashButton({ label, onPress }: Readonly<{ label: string; onPress: () => void }>) {
  return (
    <IconButton
      variant="ghost"
      size={36}
      icon="trash"
      glyph={16}
      radius="md"
      focused={false}
      onPress={onPress}
      label={label}
    />
  );
}

function GenRow({ gen, onCancel }: Readonly<{ gen: SubtitleGeneration; onCancel: () => void }>) {
  const t = useT();
  const pct = Math.round(gen.progress * 100);
  const err = gen.status === 'error';
  const engine = gen.mode === 'translate' ? t('player.subAiBadge') : 'Whisper';
  return (
    <Box
      radius="lg"
      borderWidth={1}
      border="rgba(124, 92, 255, 0.4)"
      bg="rgba(124, 92, 255, 0.06)"
      p={16}
    >
      <Box row align="center" gap={14}>
        <Txt style={s.genLang}>{gen.lang ?? ''}</Txt>
        <AiBadge />
        <TrashButton label={t('player.subGenCancel')} onPress={onCancel} />
      </Box>
      <Box row align="center" between mt={8}>
        <Box row align="center" gap={8}>
          {!err ? <Box w={6} h={6} radius="circle" bg="#8B7FF0" /> : null}
          <Txt style={s.genStage} color={err ? '#E8536A' : '#9A8FF0'}>
            {err
              ? (gen.error ?? t(subtitleStageKey(gen.stage)))
              : `${engine} · ${t(subtitleStageKey(gen.stage))}`}
          </Txt>
        </Box>
        <Txt style={s.pct} color="#B3A9F5">
          {err ? '' : `${pct} %`}
        </Txt>
      </Box>
      {!err ? (
        <>
          <Box mt={6}>
            <Progress value={gen.progress} color="#7C6FF5" trackColor="white/10" rounded />
          </Box>
          {gen.etaSec != null ? (
            <Txt style={s.eta} color="white/40">
              {t('player.subEta', { time: subtitleEtaTime(gen.etaSec) })}
            </Txt>
          ) : null}
        </>
      ) : null}
    </Box>
  );
}

const s = styles({
  pct: { font: 'ui', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  eta: { font: 'ui', fontSize: 12, mt: 6 },
  aiBadgeLabel: { font: 'ui', fontWeight: '700', fontSize: 10, color: '#B7A6FF' },
  genLang: { flex: 1, font: 'ui', fontWeight: '600', fontSize: 16 },
  genStage: { font: 'ui', fontSize: 13 },
});
