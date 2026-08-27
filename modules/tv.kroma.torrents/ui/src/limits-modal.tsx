// How fast the engine may go and how much of it may run at once.

import { useAsyncAction, useT } from '@kroma/module-sdk';
import {
  Box,
  Button,
  ButtonGroup,
  Callout,
  Dialog,
  Field,
  Row,
  Spinner,
  Text,
} from '@kroma/ui/kit';
import { useEffect, useState } from 'react';
import { createCallable } from 'react-call';
import { useTorrentsApi } from './api';
import type { LimitsView } from './schemas';

const UNLIMITED = 0;
const STRETCH = { alignSelf: 'stretch' } as const;
const DEFAULT_RATE_KBPS = 5120;
const DEFAULT_PARALLEL = 3;

/** Opened with `LimitsModal.call()`; resolves `true` once saved. */
export const LimitsModal = createCallable<void, boolean>(({ call }) => {
  const t = useT();
  const torrents = useTorrentsApi();
  const { busy, error, run } = useAsyncAction();
  const [limits, setLimits] = useState<LimitsView | null>(null);

  useEffect(() => {
    torrents
      .limits()
      .then(setLimits)
      .catch(() => setLimits({ downKbps: UNLIMITED, upKbps: UNLIMITED, maxActive: UNLIMITED }));
  }, [torrents]);

  const set = (patch: Partial<LimitsView>) =>
    setLimits((current) => (current ? { ...current, ...patch } : current));

  const save = () => {
    if (!limits) return;
    run(
      async () => {
        await torrents.saveLimits(limits);
        call.end(true);
      },
      () => t('downloads.limitsFailed'),
    );
  };

  return (
    <Dialog.Root open title={t('downloads.limitsTitle')} onClose={() => call.end(false)} width="sm">
      {limits ? (
        <>
          <Box gap={18}>
            <Ceiling
              label={t('downloads.limitDown')}
              unit={t('downloads.unitKbps')}
              value={limits.downKbps}
              whenOn={DEFAULT_RATE_KBPS}
              onValueChange={(downKbps) => set({ downKbps })}
            />
            <Ceiling
              label={t('downloads.limitUp')}
              unit={t('downloads.unitKbps')}
              value={limits.upKbps}
              whenOn={DEFAULT_RATE_KBPS}
              onValueChange={(upKbps) => set({ upKbps })}
            />
            <Ceiling
              label={t('downloads.limitParallel')}
              unit={t('downloads.unitAtOnce')}
              value={limits.maxActive}
              whenOn={DEFAULT_PARALLEL}
              onValueChange={(maxActive) => set({ maxActive })}
            />
          </Box>
          {error ? (
            <Callout.Root size="sm" tone="danger" icon="alert-triangle">
              <Callout.Title>{error}</Callout.Title>
            </Callout.Root>
          ) : null}
          <Dialog.Actions
            onCancel={() => call.end(false)}
            cancelLabel={t('common.cancel')}
            onConfirm={save}
            confirmLabel={t('common.save')}
            busy={busy}
          />
        </>
      ) : (
        <Row center py={24}>
          <Spinner />
        </Row>
      )}
    </Dialog.Root>
  );
});

function digitsOf(text: string): number {
  const digits = text.replace(/\D/g, '');
  return digits === '' ? UNLIMITED : Number(digits);
}

interface CeilingProps {
  label: string;
  unit: string;
  value: number;
  whenOn: number;
  onValueChange: (next: number) => void;
}

function Ceiling({ label, unit, value, whenOn, onValueChange }: Readonly<CeilingProps>) {
  const t = useT();
  const limited = value > UNLIMITED;
  const [previous, setPrevious] = useState(limited ? value : whenOn);

  const toggle = () => {
    if (limited) {
      setPrevious(value);
      onValueChange(UNLIMITED);
      return;
    }
    onValueChange(previous > UNLIMITED ? previous : whenOn);
  };

  return (
    <Box gap={6}>
      <Text variant="label" color="textMuted">
        {label}
      </Text>
      {/* A group hugs its content by default, which would leave three rows of
          three different widths. */}
      <ButtonGroup.Root label={label} size="sm" style={STRETCH}>
        <Field.Root
          label={label}
          hideLabel
          flex
          minW={0}
          value={limited ? String(value) : ''}
          onValueChange={(next) => onValueChange(digitsOf(next))}
        >
          <Field.Input
            placeholder={t('downloads.unlimited')}
            readOnly={!limited}
            selectOnFocus
            trailing={
              limited ? (
                <Text variant="meta" color="text/35">
                  {unit}
                </Text>
              ) : undefined
            }
          />
        </Field.Root>
        <Button
          variant="outline"
          icon="infinity"
          label={t('downloads.unlimited')}
          active={!limited}
          onPress={toggle}
        />
      </ButtonGroup.Root>
    </Box>
  );
}
