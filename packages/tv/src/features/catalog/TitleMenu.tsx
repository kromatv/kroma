import type { MediaItem, Show } from '@kromatv/client/media';
import { useT } from '@kromatv/ui';
import {
  Drawer,
  FocusColumn,
  type FocusNavHandlers,
  type IconName,
  ListRow,
  styles,
} from '@kromatv/ui/kit';
import { type ReactNode, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useContinue } from '#tv/app/providers/continue';
import { useMyList } from '#tv/app/providers/mylist';
import { useWatched } from '#tv/app/providers/watched';
import { useClient, useNav } from '#tv/app/router';
import { TitleMenuHeader } from '#tv/features/catalog/TitleMenuHeader';

/** The title a held OK opened the menu on. `resume` is a Continue watching
 * tile: a film or an episode the viewer is part way through, `progress` of
 * the way (0..1). */
export type HeldTitle =
  | { kind: 'movie'; item: MediaItem }
  | { kind: 'show'; item: Show }
  | { kind: 'resume'; item: MediaItem; progress: number };

interface TitleAction {
  icon: IconName;
  label: string;
  run: () => void;
}

interface TitleMenuProps {
  title: HeldTitle;
  open: boolean;
  onClose: () => void;
}

function useActions(title: HeldTitle): TitleAction[] {
  const t = useT();
  const nav = useNav();
  const client = useClient();
  const myList = useMyList();
  const watched = useWatched();
  const { refresh } = useContinue();
  const subject = title.item;

  if (title.kind === 'resume') {
    const forget: TitleAction = {
      icon: 'x',
      label: t('content.removeFromContinue'),
      run: () => {
        client.playback
          .forget(title.item.id)
          .then(refresh)
          .catch(() => undefined);
      },
    };
    if (title.item.kind !== 'movie') return [forget];
    const info: TitleAction = {
      icon: 'info-circle',
      label: t('content.moreInfo'),
      run: () => nav.go('movie', { item: title.item }),
    };
    return [info, forget];
  }

  const listed = myList.has(subject.id);
  const seen = watched.has(subject.id);
  const rest: TitleAction[] = [
    {
      icon: listed ? 'bookmark-off' : 'bookmark',
      label: t(listed ? 'content.removeFromList' : 'content.addToList'),
      run: () => myList.toggle(subject.id),
    },
    {
      icon: seen ? 'eye-off' : 'check',
      label: t(seen ? 'content.markUnwatched' : 'content.markWatched'),
      run: () => watched.toggle(subject.id),
    },
    {
      icon: 'flag',
      label: t('report.action'),
      run: () => nav.go('report', { kind: title.kind, id: subject.id, title: subject.title }),
    },
  ];
  if (title.kind === 'show') return rest;
  const play: TitleAction = {
    icon: 'player-play-filled',
    label: t('player.play'),
    run: () => nav.go('player', { item: title.item }),
  };
  return [play, ...rest];
}

function TitleMenu({ title, open, onClose }: Readonly<TitleMenuProps>) {
  const actions = useActions(title);
  return (
    <Drawer.Root open={open} onClose={onClose} title={title.item.title} width="md" floating>
      <Drawer.Header>
        <TitleMenuHeader title={title} />
      </Drawer.Header>
      <Drawer.Panel>
        <FocusColumn style={s.actions}>
          {actions.map((action, at) => (
            <ListRow.Root
              key={action.label}
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
