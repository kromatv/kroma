import type { MediaItem, Show } from '@kromatv/client/media';
import { Drawer, FocusColumn, type FocusNavHandlers, ListRow, styles } from '@kromatv/ui/kit';
import { type ReactNode, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { TitleMenuHeader } from '#tv/features/catalog/TitleMenuHeader';
import { useTitleActions } from '#tv/features/catalog/useTitleActions';

/** The title a held OK opened the menu on. `resume` is a Continue watching
 * tile: a film or an episode the viewer is part way through, `progress` of
 * the way (0..1). */
export type HeldTitle =
  | { kind: 'movie'; item: MediaItem }
  | { kind: 'show'; item: Show }
  | { kind: 'episode'; item: MediaItem }
  | { kind: 'resume'; item: MediaItem; progress: number };

interface TitleMenuProps {
  title: HeldTitle;
  open: boolean;
  onClose: () => void;
}

function TitleMenu({ title, open, onClose }: Readonly<TitleMenuProps>) {
  const actions = useTitleActions(title);
  return (
    <Drawer.Root open={open} onClose={onClose} title={title.item.title} width="md" floating>
      <Drawer.Header>
        <TitleMenuHeader title={title} />
      </Drawer.Header>
      <Drawer.Panel>
        <FocusColumn style={s.actions}>
          {actions.map((action, at) => (
            <ListRow.Root
              key={action.id}
              icon={action.icon}
              size="tv"
              ground="surface"
              chevron={false}
              autoFocus={at === 0}
              onPress={() => {
                onClose();
                action.run();
              }}
            >
              <ListRow.Label>{action.label}</ListRow.Label>
            </ListRow.Root>
          ))}
        </FocusColumn>
      </Drawer.Panel>
    </Drawer.Root>
  );
}

const s = styles({
  actions: { gap: 12 },
});

/** The sheet a held OK slides in over a title tile, YouTube's long press on a
 * TV. The screen renders `menu`, hands `open` to each tile's `onLongPress`, and
 * binds the `onBack` it gets back: the screen's own, answering "not handled"
 * while the sheet is up so Back closes the sheet rather than the screen. */
export function useTitleMenu(onBack: FocusNavHandlers['onBack']): {
  open: (title: HeldTitle) => void;
  onBack: NonNullable<FocusNavHandlers['onBack']>;
  menu: ReactNode;
} {
  const [title, setTitle] = useState<HeldTitle | null>(null);
  const [opened, setOpened] = useState(false);
  const shown = useRef(false);
  useLayoutEffect(() => {
    shown.current = opened;
  });
  const open = useCallback((next: HeldTitle) => {
    setTitle(next);
    setOpened(true);
  }, []);
  const close = useCallback(() => setOpened(false), []);
  const back = useCallback(() => (shown.current ? false : onBack?.()), [onBack]);
  const menu = title ? <TitleMenu title={title} open={opened} onClose={close} /> : null;
  return { open, onBack: back, menu };
}
