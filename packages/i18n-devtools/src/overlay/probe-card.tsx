import { Box, placeUnder, Row, Surface, Text } from '@kroma/ui/kit';
import { useSyncExternalStore } from 'react';
import { categoryOf } from '../engine/plural';
import { Chord } from '../panel/chord';
import type { Modifier } from '../panel/shortcut';
import { GRADE_PAINT } from './highlight';
import type { Grade } from './mark';
import { onProbe, probed } from './probe';
import { useOrigin } from './use-origin';

const WIDTH_PX = 272;
const DOT = 8;

const SAID: Record<Grade, string | null> = {
  catalog: null,
  fallback: 'fallback locale',
  vars: 'a variable it was not given',
  missing: 'no catalog answers it',
  raw: 'not a key',
};

function source(scope: string | null, locale: string | null): string | null {
  return locale ? `${scope ?? 'core'}@${locale}` : null;
}

function namedHoles(holes: readonly string[]): string {
  return holes.map((hole) => `{${hole}}`).join(' ');
}

function said(name: string, value: string | number, locale: string | null): string {
  if (name !== 'count' || typeof value !== 'number') return `${name} = ${value}`;
  return `${name} = ${value} → ${categoryOf(locale ?? 'en', value)}`;
}

/** The card naming what drew the string under the pointer, in its own fixed
 *  layer beside it: below where there is room, above where there is not, so it
 *  never leaves the viewport. */
export function ProbeCard() {
  const probe = useSyncExternalStore(onProbe, probed, probed);
  const origin = useOrigin(probe?.origin ?? null);
  if (!probe) return null;

  const from = source(probe.scope, probe.locale);
  const vars = Object.entries(probe.vars ?? {});
  const at = placeUnder(
    { left: probe.left, top: probe.top, width: 0, height: probe.bottom - probe.top },
    { width: window.innerWidth, height: window.innerHeight },
    { minWidth: WIDTH_PX, maxHeight: window.innerHeight },
  );
  return (
    <div style={{ position: 'fixed', ...at, width: WIDTH_PX, pointerEvents: 'none' }}>
      <Surface tone="raised" pad="sm" elevated gap={6}>
        <Text variant="meta" font="mono" color="text" lines={2}>
          {probe.key ?? probe.text}
        </Text>
        <Row align="center" gap={7}>
          <Box w={DOT} h={DOT} shrink={0} radius="circle" bg={GRADE_PAINT[probe.grade]} />
          <Text variant="meta" color="textDim" lines={2} shrink={1}>
            {[from, origin?.label, SAID[probe.grade]].filter(Boolean).join(' · ')}
          </Text>
        </Row>
        {vars.map(([name, value]) => (
          <Text key={name} variant="meta" font="mono" color="textMuted" lines={1}>
            {said(name, value, probe.locale)}
          </Text>
        ))}
        {probe.holes.length > 0 && (
          <Text variant="meta" font="mono" color="danger" lines={2}>
            {`${namedHoles(probe.holes)} given no value`}
          </Text>
        )}
        {probe.copied ? (
          <Text variant="meta" color="success">
            Key copied
          </Text>
        ) : (
          <Row align="center" gap={10}>
            {probe.key && <Chord hold={ALT} does="copy" />}
            {probe.origin && <Chord hold={ALT_SHIFT} does="open" />}
          </Row>
        )}
      </Surface>
    </div>
  );
}

const ALT: readonly Modifier[] = ['alt'];
const ALT_SHIFT: readonly Modifier[] = ['alt', 'shift'];
