import { Row } from '@kromatv/ui/kit/atoms/box';
import { Kbd } from '@kromatv/ui/kit/atoms/kbd';
import { Text } from '@kromatv/ui/kit/atoms/text';
import type { ReactNode } from 'react';
import { useModifier } from '#site/lib/use-modifier.hook';

function Shortcut({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <Row gap={3} align="center">
      {children}
      <Text variant="meta" color="textDim" ml={4}>
        {label}
      </Text>
    </Row>
  );
}

/** The editor's keyboard shortcuts, in one quiet line. */
export function ShortcutsHint() {
  const modifier = useModifier();
  return (
    <Row gap={16} wrap align="center" aria-label="Keyboard shortcuts">
      <Shortcut label="save and next">
        <Kbd>{modifier}</Kbd>
        <Kbd icon="corner-down-left" />
      </Shortcut>
      <Shortcut label="previous / next">
        <Kbd>{modifier}</Kbd>
        <Kbd icon="arrow-up" />
        <Kbd icon="arrow-down" />
      </Shortcut>
      <Shortcut label="insert variable">
        <Kbd>Alt</Kbd>
        <Kbd>V</Kbd>
      </Shortcut>
      <Shortcut label="search">
        <Kbd>{modifier}</Kbd>
        <Kbd>K</Kbd>
      </Shortcut>
    </Row>
  );
}
