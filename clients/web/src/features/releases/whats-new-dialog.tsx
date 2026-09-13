import type { Highlight } from '@kromatv/client/releases';
import { useT } from '@kromatv/ui';
import {
  Box,
  Button,
  Dialog,
  Divider,
  Focusable,
  IconButton,
  Kbd,
  Row,
  sv,
  Text,
  useBreakpoint,
} from '@kromatv/ui/kit';
import { useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { createCallable } from 'react-call';
import { HighlightArt } from '#web/features/releases/highlight-art';
import type { WhatsNew } from '#web/features/releases/release-model';
import { RouteLink } from '#web/shared/ui/route-link';

const dot = sv({
  base: { w: 6, h: 6, radius: 'pill', bg: 'tint/20' },
  variants: { on: { true: { w: 18, bg: 'accent' }, false: {} } },
  defaults: { on: false },
});

/** Resolves when it closes, whichever way: a button, Escape, the backdrop, or
 *  the route changing under it. */
export const WhatsNewDialog = createCallable<WhatsNew, void>(({ call, release, steps }) => {
  const t = useT();
  const breakpoint = useBreakpoint();
  const [index, setIndex] = useState(0);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [openedOn] = useState(pathname);
  const last = steps.length - 1;
  const onLast = index === last;
  const highlight = steps[index] ?? steps[0];

  useEffect(() => {
    if (pathname !== openedOn) call.end();
  }, [pathname, openedOn, call]);

  useEffect(() => {
    const page = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'ArrowRight') setIndex((at) => Math.min(at + 1, last));
      if (event.key === 'ArrowLeft') setIndex((at) => Math.max(at - 1, 0));
    };
    window.addEventListener('keydown', page);
    return () => window.removeEventListener('keydown', page);
  }, [last]);

  const advance = () => {
    if (onLast) call.end();
    else setIndex(index + 1);
  };

  return (
    <Dialog.Root
      open
      width="lg"
      pad={0}
      title={t('releases.version', { version: release.version })}
      titleHidden
      onClose={() => call.end()}
    >
      <Dialog.Panel>
        <Box>
          {highlight.image ? <HighlightArt image={highlight.image} /> : null}
          <Box gap={10} px={40} pt={30} minH={150}>
            <Text variant="overline" color="accentText">
              {t('releases.step', { index: index + 1, count: steps.length })}
            </Text>
            <Text variant="heading">{highlight.title}</Text>
            <Text variant="body" color="textMuted">
              {highlight.body}
            </Text>
            {onLast && release.fixed.length > 0 ? (
              <Text variant="meta" color="textDim">
                {t('releases.alsoFixed', { count: release.fixed.length })}
              </Text>
            ) : null}
          </Box>
          <Box absolute top={16} right={16}>
            <IconButton
              variant="scrim"
              diameter={40}
              icon="x"
              label={t('common.close')}
              onPress={() => call.end()}
            />
          </Box>
        </Box>
      </Dialog.Panel>
      <Dialog.Footer>
        <Row between wrap gap={16} px={40} pt={26} pb={28}>
          <StepDots steps={steps} index={index} onSelect={setIndex} />
          <Row gap={12}>
            <Button variant="ghost" label={t('releases.allVersions')} asChild>
              <RouteLink to="/whats-new" />
            </Button>
            <Button
              label={onLast ? t('releases.done') : t('common.next')}
              iconRight={onLast ? undefined : 'arrow-right'}
              onPress={advance}
            />
          </Row>
        </Row>
        {breakpoint === 'lg' || breakpoint === 'tv' ? <KeyHints /> : null}
      </Dialog.Footer>
    </Dialog.Root>
  );
});

interface StepDotsProps {
  steps: readonly Highlight[];
  index: number;
  onSelect: (index: number) => void;
}

function StepDots({ steps, index, onSelect }: Readonly<StepDotsProps>) {
  const t = useT();
  return (
    <Row gap={8}>
      {steps.map((step, at) => (
        <Focusable
          key={step.title}
          sv={dot}
          vars={{ on: at === index }}
          hitSlop={10}
          current={at === index ? 'step' : undefined}
          label={t('releases.step', { index: at + 1, count: steps.length })}
          onPress={() => onSelect(at)}
        />
      ))}
    </Row>
  );
}

function KeyHints() {
  const t = useT();
  return (
    <>
      <Divider />
      <Row gap={22} px={40} py={12}>
        <Row gap={8}>
          <Kbd>←</Kbd>
          <Kbd>→</Kbd>
          <Text variant="meta" color="textDim">
            {t('releases.keysBrowse')}
          </Text>
        </Row>
        <Row gap={8}>
          <Kbd>esc</Kbd>
          <Text variant="meta" color="textDim">
            {t('releases.keysClose')}
          </Text>
        </Row>
      </Row>
    </>
  );
}
