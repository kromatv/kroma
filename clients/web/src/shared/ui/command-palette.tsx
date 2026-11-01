import type { User } from '@kromatv/client/accounts';
import { useT } from '@kromatv/ui';
import {
  Box,
  Command,
  type CommandItem,
  Kbd,
  Row,
  Text,
  useBreakpoint,
  useConfirm,
} from '@kromatv/ui/kit';
import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { useAuth } from '#web/shared/lib/auth';
import { readCommandUsage, recordCommandUse, usageBoost } from '#web/shared/lib/command-usage';
import {
  useCommandMenu,
  useCommandQuery,
  useContributedCommands,
} from '#web/shared/lib/command-menu';
import {
  readRecentCommands,
  recentFirst,
  rememberCommand,
  restoredCommands,
} from '#web/shared/lib/recent-commands';
import { commandAt, runAction, visibleCommands } from '#web/shared/lib/resolve-commands';

function Hint({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <Row gap={3}>
      {children}
      <Text variant="meta" color="textDim" ml={3}>
        {label}
      </Text>
    </Row>
  );
}

function Bar() {
  const t = useT();
  const step = useBreakpoint();
  const wide = step === 'lg' || step === 'tv';

  return (
    <Command.Footer>
      {wide ? (
        <>
          <Hint label={t('commands.hintMove')}>
            <Kbd icon="arrow-up" />
            <Kbd icon="arrow-down" />
          </Hint>
          <Hint label={t('commands.hintClose')}>
            <Kbd>esc</Kbd>
          </Hint>
        </>
      ) : null}
      <Box flex />
      <Command.Primary />
      <Command.Trigger label={t('commands.actions')} />
    </Command.Footer>
  );
}

function Palette({ user }: Readonly<{ user: User }>) {
  const t = useT();
  const navigate = useNavigate();
  const router = useRouter();
  const confirm = useConfirm();
  const { close, setQuery } = useCommandMenu();
  const query = useCommandQuery();
  const commands = useContributedCommands();
  const pathname = useRouterState({ select: ({ location }) => location.pathname });

  const [recent] = useState(() => readRecentCommands(user.id));
  const [usage] = useState(() => readCommandUsage(user.id));
  const boost = useCallback(
    (item: CommandItem, typed: string) => usageBoost(usage, item.id, typed),
    [usage],
  );
  const pageGroup = t('commands.groupPage');
  const recentGroup = t('commands.groupRecent');
  const { items, byId } = useMemo(
    () =>
      visibleCommands(
        [...commands, ...restoredCommands(recent, recentGroup, commands)],
        user,
        t,
        ({ to, params, search, hash }) =>
          router.buildLocation({ to, params, search, hash } as never).href,
      ),
    [commands, recent, recentGroup, user, t, router],
  );
  const current = commandAt(byId, pathname);
  const listed = query.trim()
    ? items
    : recentFirst(items, recent, { group: recentGroup, pageGroup, current });

  return (
    <Command.Root
      modal
      closeLabel={t('commands.close')}
      items={listed}
      boost={boost}
      selected={current}
      query={query}
      onQueryChange={setQuery}
      onSelect={(item, chosen) => {
        const resolved = byId.get(item.id);
        const action = chosen && resolved?.actions.get(chosen.id);
        if (!resolved || !action) return;
        recordCommandUse(user.id, item.id, query);
        if (chosen === item.actions?.[0]) rememberCommand(user.id, item.id, resolved.command);
        void runAction(action, { navigate, confirm, t });
      }}
      onClose={close}
    >
      <Command.Input label={t('commands.field')} placeholder={t('commands.placeholder')} />
      <Command.List />
      <Command.Empty>{t('commands.empty')}</Command.Empty>
      <Bar />
      <Command.Actions label={t('commands.actionsField')} closeLabel={t('commands.closeActions')} />
    </Command.Root>
  );
}

/** The command menu's sheet, listing every row `useCommands` has contributed. */
export function CommandPalette() {
  const { user } = useAuth();
  return user ? <Palette user={user} /> : null;
}
