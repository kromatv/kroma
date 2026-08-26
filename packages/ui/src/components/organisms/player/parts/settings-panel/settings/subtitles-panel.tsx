import type { RemoteKey, SubtitleGeneration } from '@kroma/core';
import { langName, subtitleEtaTime, subtitleStageKey } from '@kroma/core';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { IconButton } from '#ui/components/atoms/icon-button';
import { Progress } from '#ui/components/atoms/progress';
import { Text } from '#ui/components/atoms/text';
import { useListFocus } from '#ui/components/organisms/player/hooks/use-list-focus';
import type { PanelHandle } from '#ui/components/organisms/player/lib/nav';
import { IconAi } from '#ui/components/organisms/player/parts/icons';
import type { PlayerSub } from '#ui/components/organisms/player/types';
import { styles } from '#ui/core';
import { useT } from '#ui/services/i18n';
import type { SubtitleGenBundle } from './gen';
import { GenerateWizard } from './generate-wizard';
import { panel } from './panel-style';
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
          index={0}
          label={t('player.subtitlesOff')}
          selected={current == null}
          focused={focus.index === 0}
          onActivate={activate}
          onFocus={focus.setIndex}
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
                index={i + 1}
                label={
                  s.ai && s.label ? s.label : langName(t, s.language) || t('player.langUnknown')
                }
                sub={s.selectable ? codec : `${codec} · ${t('player.pictureSub')}`}
                trailing={s.ai ? <AiBadge /> : null}
                selected={current === s.index}
                focused={focus.index === i + 1}
                onActivate={activate}
                onFocus={focus.setIndex}
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
          <GenRow key={g.id} gen={g} onCancel={gen.onCancel} />
        ))}
        {gen.canCreate && !wizardOpen ? (
          <SelectRow
            index={createIndex}
            leading={<IconAi size={22} />}
            label={t('player.subCreateMissing')}
            focused={focus.index === createIndex}
            onActivate={activate}
            onFocus={focus.setIndex}
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
      <Text style={s.aiBadgeLabel}>IA</Text>
    </Box>
  );
}

// Pointer-only, controlled at `false`: never a platform focus target (see
// ../../lib/virtual-focus.ts).
function TrashButton({ label, onPress }: Readonly<{ label: string; onPress: () => void }>) {
  return (
    <IconButton
      variant="ghost"
      diameter={36}
      icon="trash"
      glyph={16}
      radius="md"
      focused={false}
      onPress={onPress}
      label={label}
    />
  );
}

function GenRow({
  gen,
  onCancel,
}: Readonly<{ gen: SubtitleGeneration; onCancel: (id: string) => void }>) {
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
        <Text style={s.genLang}>{gen.lang ?? ''}</Text>
        <AiBadge />
        <TrashButton label={t('player.subGenCancel')} onPress={() => onCancel(gen.id)} />
      </Box>
      <Box row align="center" between mt={8}>
        <Box row align="center" gap={8}>
          {!err ? <Box w={6} h={6} radius="circle" bg="#8B7FF0" /> : null}
          <Text style={s.genStage} color={err ? '#E8536A' : '#9A8FF0'}>
            {err
              ? (gen.error ?? t(subtitleStageKey(gen.stage)))
              : `${engine} · ${t(subtitleStageKey(gen.stage))}`}
          </Text>
        </Box>
        <Text style={s.pct} color="#B3A9F5">
          {err ? '' : `${pct} %`}
        </Text>
      </Box>
      {!err ? (
        <>
          <Box mt={6}>
            <Progress value={gen.progress} color="#7C6FF5" trackColor="white/10" rounded />
          </Box>
          {gen.etaSec != null ? (
            <Text style={s.eta} color="white/40">
              {t('player.subEta', { time: subtitleEtaTime(gen.etaSec) })}
            </Text>
          ) : null}
        </>
      ) : null}
    </Box>
  );
}

const s = styles({
  pct: { text: 'footnoteTv', fontVariant: ['tabular-nums'] },
  eta: { text: 'footnoteTv', mt: 6 },
  aiBadgeLabel: { text: 'overline', color: '#B7A6FF' },
  genLang: { flex: 1, text: 'labelTv' },
  genStage: { text: 'footnoteTv' },
});
