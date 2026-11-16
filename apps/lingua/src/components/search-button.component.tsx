import { CONTROL, type StyleDecl, svFor } from '@kromatv/ui/kit';
import { Row } from '@kromatv/ui/kit/atoms/box';
import { Focusable } from '@kromatv/ui/kit/atoms/focusable';
import { Icon } from '@kromatv/ui/kit/atoms/icon';
import { IconButton } from '@kromatv/ui/kit/atoms/icon-button';
import { Kbd } from '@kromatv/ui/kit/atoms/kbd';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { useCommandMenu } from '#site/lib/use-command-menu.hook';
import { useModifier } from '#site/lib/use-modifier.hook';

const field = svFor<{ root: StyleDecl; label: StyleDecl; glyph: { color: string } }>()({
  slots: {
    root: {
      row: true,
      align: 'center',
      gap: 8,
      minH: 36,
      pl: 12,
      pr: 6,
      minW: 168,
      radius: CONTROL.sm.radius,
      bg: 'bg',
      border: 'border',
      _hover: { border: 'borderStrong' },
    },
    label: { color: 'textDim', flex: 1 },
    glyph: { color: 'textDim' },
  },
});

function SearchField({ onPress }: Readonly<{ onPress: () => void }>) {
  const modifier = useModifier();
  return (
    <Focusable sv={field} label={`Search and commands, ${modifier}+K`} onPress={onPress}>
      {({ slots }) => (
        <>
          <Icon name="search" size={16} color={slots.glyph.color} />
          <Text variant="meta" style={slots.label}>
            Search…
          </Text>
          <Row gap={3}>
            <Kbd>{modifier}</Kbd>
            <Kbd>K</Kbd>
          </Row>
        </>
      )}
    </Focusable>
  );
}

/** The way into the command menu from the header, with the shortcut that opens it from anywhere; a lone glass on a phone. */
export function SearchButton({ wide }: Readonly<{ wide: boolean }>) {
  const { open } = useCommandMenu();
  if (wide) {
    return <SearchField onPress={open} />;
  }
  return (
    <IconButton
      variant="ghost"
      diameter={44}
      glyph={20}
      icon="search"
      label="Search and commands"
      onPress={open}
    />
  );
}
