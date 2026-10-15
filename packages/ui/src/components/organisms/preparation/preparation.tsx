import type { CapabilitySource } from '@kromatv/client/capabilities';
import type { WatchableProgress } from '@kromatv/client/watchable';
import { type Arrival, arrivalOf, type WatchStage, watchAction } from '@kromatv/core';
import { Box, Row } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Img } from '#ui/components/atoms/img';
import { Spinner } from '#ui/components/atoms/spinner';
import { Text } from '#ui/components/atoms/text';
import { BackButton } from '#ui/components/molecules/back-button';
import { Callout } from '#ui/components/molecules/callout';
import { styles } from '#ui/core';
import { useLocale, useT } from '#ui/services/i18n';
import { PreparationChoice } from './preparation-choice';
import { PreparationFigures } from './preparation-figures';

type Waiting = Exclude<WatchStage, { stage: 'failed' }>;
type Refused = Extract<WatchStage, { stage: 'failed' }>;

const STAGE_KEY = {
  searching: 'requests.watchSearching',
  connecting: 'requests.watchConnecting',
  buffering: 'requests.watchBuffering',
  ready: 'requests.watchBuffering',
} as const;

const FAILURE_KEY = {
  noSource: 'requests.watchNoSource',
  noIndexer: 'requests.indexersAllFailed',
  unsupported: 'requests.watchUnsupported',
  failed: 'requests.watchStartFailed',
} as const;

const s = styles({ column: { maxWidth: 560 } });

interface PreparationProps {
  stage: WatchStage;
  /** What has arrived, or null before the source first answers. */
  progress: WatchableProgress | null;
  /** Null reads the payload as the figures a download reported before a source
   *  could name its own. */
  source?: CapabilitySource | null;
  /** Drawn as a choice in place of what is standing, while `source` is null and
   *  more than one answers. */
  sources?: readonly CapabilitySource[];
  onSourceChange?: (mount: string) => void;
  /** What is being prepared, in the caller's own words. Null draws no heading. */
  title: string | null;
  /** Artwork behind the scrim, already sized. Null leaves the screen black. */
  art: string | null;
  onBack: () => void;
  /** Offered at every stage but a refusal, which offers `onBack` instead, under
   *  the source's own word for it where it declares one. */
  onCancel: () => void;
}

function Standing({ stage, arrival }: Readonly<{ stage: Waiting; arrival: Arrival | null }>) {
  const t = useT();
  const release = 'release' in stage ? stage.release : null;
  return (
    <Box gap={16} align="center" w="100%">
      <Row gap={12} accessibilityLiveRegion="polite">
        <Spinner size={22} />
        <Text variant="label" color="white">
          {t(STAGE_KEY[stage.stage])}
        </Text>
      </Row>
      {release ? (
        <Text variant="meta" color="white/55" textAlign="center" lines={2}>
          {t('requests.watchRelease', { release })}
        </Text>
      ) : null}
      {arrival ? <PreparationFigures arrival={arrival} /> : null}
    </Box>
  );
}

function Refusal({ stage, onBack }: Readonly<{ stage: Refused; onBack: () => void }>) {
  const t = useT();
  return (
    <>
      <Callout.Root size="sm" tone="danger" icon="alert-triangle">
        <Callout.Title>{t(FAILURE_KEY[stage.failure])}</Callout.Title>
        {stage.message ? <Callout.Detail>{stage.message}</Callout.Detail> : null}
      </Callout.Root>
      <Button variant="glass" icon="chevron-left" label={t('common.back')} onPress={onBack} />
    </>
  );
}

interface Choice {
  sources: readonly CapabilitySource[];
  onPick: (mount: string) => void;
}

interface BodyProps extends Readonly<Pick<PreparationProps, 'stage' | 'onCancel'>> {
  source: CapabilitySource | null;
  choice: Choice | null;
  arrival: Arrival | null;
  onBack: () => void;
}

function Body({ stage, source, choice, arrival, onBack, onCancel }: BodyProps) {
  const t = useT();
  if (stage.stage === 'failed') return <Refusal stage={stage} onBack={onBack} />;
  if (choice) return <PreparationChoice sources={choice.sources} onPick={choice.onPick} />;
  return (
    <>
      <Standing stage={stage} arrival={arrival} />
      <Button
        variant="glass"
        label={watchAction(source, 'cancel') ?? t('common.cancel')}
        onPress={onCancel}
      />
    </>
  );
}

/** Takes the whole region it is given, so a shell mounts it over its own chrome
 *  rather than inside a page. */
function Preparation({
  stage,
  progress,
  source = null,
  sources = [],
  onSourceChange,
  title,
  art,
  onBack,
  onCancel,
}: Readonly<PreparationProps>) {
  const t = useT();
  const locale = useLocale();
  const arrival = progress ? arrivalOf({ source, progress, t, locale }) : null;
  const choice: Choice | null =
    !source && sources.length > 1 && onSourceChange ? { sources, onPick: onSourceChange } : null;

  return (
    <Box fill bg="black" overflow="hidden">
      {art ? <Img src={art} fit="cover" fill priority /> : null}
      <Box fill bg="black/85" />

      <Box fill center px={24} gap={24}>
        <Box gap={24} align="center" style={s.column}>
          {title ? (
            <Text variant="h1" color="white" textAlign="center" lines={2}>
              {title}
            </Text>
          ) : null}
          <Body
            stage={stage}
            source={source}
            choice={choice}
            arrival={arrival}
            onBack={onBack}
            onCancel={onCancel}
          />
        </Box>
      </Box>

      <Box absolute top={24} left={24}>
        <BackButton label={t('common.back')} onPress={onBack} />
      </Box>
    </Box>
  );
}

export type { PreparationProps };
export { Preparation };
