import { moduleWords } from '@kromatv/core';
import { useFormat, useLocale, useT } from '@kromatv/ui';
import {
  Box,
  GuidedFlow,
  Icon,
  ListRow,
  Row,
  Skeleton,
  Spinner,
  styles,
  Text,
  useStyles,
} from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { offerReach, offerWords } from '#web/features/setup/module-offer-words';
import {
  OFFERS_QUERY,
  type Offer,
  type OfferState,
  offerState,
  offers,
  pickedBytes,
} from '#web/features/setup/module-offers';
import { useSetupPicks } from '#web/features/setup/setup-picks.component';
import { listOf } from '#web/shared/lib/module-permissions-words';
import { useWebRuntime } from '#web/shared/lib/web-runtime';
import { Image } from '#web/shared/ui';

const STATE_LINE = {
  installed: 'setup.modulesInstalled',
  leaving: 'setup.modulesLeaving',
  installing: 'setup.modulesInstalling',
} as const;

const MARK = {
  open: { icon: 'plus', bg: 'tint/6', border: 'borderStrong', ink: 'textMuted' },
  picked: { icon: 'check', bg: 'accent', border: 'accent', ink: 'accentInk' },
  installed: { icon: 'check', bg: 'success', border: 'success', ink: 'bg' },
  leaving: { icon: 'x', bg: 'tint/6', border: 'borderStrong', ink: 'textMuted' },
} as const;

const sDefinition = styles({
  picked: { bg: 'accentSoft', borderColor: 'accent' },
});

function useOffers() {
  const { moduleApi } = useWebRuntime();
  return useQuery({ queryKey: OFFERS_QUERY, queryFn: () => moduleApi.fetchStoreCatalog() });
}

function useOfferFacts(offer: Offer, state: OfferState): string {
  const t = useT();
  const fmt = useFormat();
  const locale = useLocale();
  if (state === 'installed' || state === 'leaving' || state === 'installing') {
    return t(STATE_LINE[state]);
  }
  const size = fmt.bytes(pickedBytes([offer], [String(offer.module.id)]));
  const names = offer.needs.map((needed) => moduleWords(needed, locale).name).join(', ');
  return names ? `${size} · ${t('setup.modulesNeeds', { names })}` : size;
}

function PickMark({ state }: Readonly<{ state: OfferState }>) {
  if (state === 'installing') {
    return <Spinner size={22} />;
  }
  const mark = MARK[state];
  return (
    <Box w={28} h={28} radius="pill" center bg={mark.bg} border={mark.border}>
      <Icon name={mark.icon} size={16} color={mark.ink} />
    </Box>
  );
}

interface OfferRowProps {
  offer: Offer;
  state: OfferState;
  onToggle: () => void;
}

function pickControl({ offer, state, onToggle }: OfferRowProps) {
  const fixed = state === 'installing' || (!offer.installed && !offer.module.compatible);
  if (fixed) {
    return { role: undefined, checked: undefined, onPress: undefined };
  }
  const checked = state === 'picked' || state === 'installed';
  return { role: 'checkbox', checked, onPress: onToggle } as const;
}

function OfferIcon({ icon }: Readonly<{ icon: Offer['module']['icon'] }>) {
  return (
    <Box w={48} h={48} radius="lg" overflow="hidden" bg="tint/6">
      {icon ? <Image src={icon} fit="cover" fill /> : null}
    </Box>
  );
}

function OfferReach({ offer }: Readonly<{ offer: Offer }>) {
  const t = useT();
  const reach = offerReach(offer, t);
  if (reach.length === 0) {
    return null;
  }
  return (
    <Text variant="meta" color="textDim" lines={2}>
      {t('setup.modulesReaches', { list: listOf(reach, t) })}
    </Text>
  );
}

function OfferRow({ offer, state, onToggle }: Readonly<OfferRowProps>) {
  const s = useStyles(sDefinition);
  const words = offerWords(offer, useLocale());
  const facts = useOfferFacts(offer, state);
  const control = pickControl({ offer, state, onToggle });
  return (
    <ListRow.Root
      size="md"
      ground="surface"
      role={control.role}
      checked={control.checked}
      chevron={false}
      onPress={control.onPress}
      style={state === 'picked' ? s.picked : undefined}
    >
      <ListRow.Leading>
        <OfferIcon icon={offer.module.icon} />
      </ListRow.Leading>
      <ListRow.Label>{words.name}</ListRow.Label>
      <ListRow.Hint lines={2}>{words.sentence}</ListRow.Hint>
      <Text variant="meta" color="textDim" lines={1}>
        {facts}
      </Text>
      <OfferReach offer={offer} />
      <ListRow.Trailing>
        <PickMark state={state} />
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

function flipped(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((held) => held !== id) : [...ids, id];
}

function useChoices() {
  const picks = useSetupPicks();
  const toggle = (offer: Offer) => {
    const id = String(offer.module.id);
    if (offer.installed) {
      picks.setDropped(flipped(picks.dropped, id));
    } else {
      picks.setPicked(flipped(picks.picked, id));
    }
  };
  return { picks, toggle };
}

function OfferList({ all }: Readonly<{ all: readonly Offer[] }>) {
  const { picks, toggle } = useChoices();
  return (
    <Box gap={8}>
      {all.map((offer) => (
        <OfferRow
          key={offer.module.id}
          offer={offer}
          state={offerState(offer, picks)}
          onToggle={() => toggle(offer)}
        />
      ))}
    </Box>
  );
}

const LOADING_ROWS = ['first', 'second', 'third', 'fourth'];

function OffersLoading() {
  return (
    <Box gap={8}>
      {LOADING_ROWS.map((row) => (
        <Skeleton key={row} w="100%" h={112} radius="lg" />
      ))}
    </Box>
  );
}

function SummaryLine({ icon, line }: Readonly<{ icon: 'download' | 'trash'; line: string }>) {
  return (
    <Row align="center" gap={6}>
      <Icon name={icon} size={14} color="textMuted" />
      <Text variant="meta" color="textMuted" lines={1}>
        {line}
      </Text>
    </Row>
  );
}

function ChoiceSummary({ all }: Readonly<{ all: readonly Offer[] }>) {
  const t = useT();
  const fmt = useFormat();
  const { picked, dropped } = useSetupPicks();
  if (picked.length + dropped.length === 0) {
    return null;
  }
  const size = fmt.bytes(pickedBytes(all, picked));
  return (
    <Row align="center" gap={16} wrap>
      {picked.length > 0 ? (
        <SummaryLine
          icon="download"
          line={t('setup.modulesPicked', { count: picked.length, size })}
        />
      ) : null}
      {dropped.length > 0 ? (
        <SummaryLine icon="trash" line={t('setup.modulesDropped', { count: dropped.length })} />
      ) : null}
    </Row>
  );
}

interface ModulesActionsProps {
  all: readonly Offer[];
  onBack: () => void;
  onContinue: () => void;
}

function ModulesActions({ all, onBack, onContinue }: Readonly<ModulesActionsProps>) {
  return (
    <GuidedFlow.Footer>
      <GuidedFlow.Hint>
        <ChoiceSummary all={all} />
      </GuidedFlow.Hint>
      <GuidedFlow.Previous onPress={onBack} />
      <GuidedFlow.Actions>
        <GuidedFlow.Next onPress={onContinue} />
      </GuidedFlow.Actions>
    </GuidedFlow.Footer>
  );
}

/** What else the server can do. Each module is offered in its own words, with
 * its size and what installs with it. A module the server holds is selected,
 * and no other is. A choice is only a choice: the owner changes it until they
 * leave the setup, which is when it is applied. */
export function ModulesStep({
  onBack,
  onContinue,
}: Readonly<{ onBack: () => void; onContinue: () => void }>) {
  const t = useT();
  const { data, isPending } = useOffers();
  const all = data ? offers(data) : [];
  return (
    <>
      <GuidedFlow.Header>
        <GuidedFlow.Title>{t('setup.modulesTitle')}</GuidedFlow.Title>
        <GuidedFlow.Subtitle>{t('setup.modulesSub')}</GuidedFlow.Subtitle>
      </GuidedFlow.Header>
      <GuidedFlow.Panel>
        {isPending ? <OffersLoading /> : <OfferList all={all} />}
        {!isPending && all.length === 0 ? (
          <Text color="textMuted">{t('setup.modulesNone')}</Text>
        ) : null}
      </GuidedFlow.Panel>
      <ModulesActions all={all} onBack={onBack} onContinue={onContinue} />
    </>
  );
}
