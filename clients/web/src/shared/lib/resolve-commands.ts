import { apiErrorText } from '@kromatv/client';
import { hasPermission, type User } from '@kromatv/client/accounts';
import type { useT } from '@kromatv/ui';
import { type CommandItem, toast, type useConfirm } from '@kromatv/ui/kit';
import type { useNavigate } from '@tanstack/react-router';
import type { CommandActionDef, CommandDef } from '#web/shared/lib/command-menu';

type Translate = ReturnType<typeof useT>;

/** One row as the palette lists it: what it is, and what each of its actions does. */
export interface ResolvedCommand {
  command: CommandDef;
  actions: ReadonlyMap<string, CommandActionDef>;
}

function allowed({ cap }: CommandActionDef, user: User): boolean {
  if (!cap) return true;
  if (typeof cap === 'string') return hasPermission(user, cap);
  return cap.some((one) => hasPermission(user, one));
}

function commandId({ id, to, params, search, group, label }: CommandDef): string {
  if (id) return id;
  return to && !params && !search ? to : `${group ?? ''}:${label}`;
}

function primaryAction(command: CommandDef, t: Translate): CommandActionDef {
  return {
    ...command,
    label: command.primaryLabel ?? t(command.to ? 'commands.actionOpen' : 'commands.actionRun'),
    icon: command.to ? 'arrow-right' : 'bolt',
  };
}

function routeActions(
  command: CommandDef,
  t: Translate,
  hrefOf: (command: CommandDef) => string,
): CommandActionDef[] {
  if (!command.to) return [];
  return [
    {
      label: t('commands.actionNewTab'),
      icon: 'external-link',
      run: () => window.open(hrefOf(command), '_blank', 'noopener'),
    },
    {
      label: t('commands.actionCopyLink'),
      icon: 'link',
      done: t('commands.linkCopied'),
      run: () => navigator.clipboard.writeText(new URL(hrefOf(command), location.origin).href),
    },
  ];
}

function actionsOf(
  command: CommandDef,
  user: User,
  t: Translate,
  hrefOf: (command: CommandDef) => string,
): CommandActionDef[] {
  const own = (command.actions ?? []).filter(
    (action): action is CommandActionDef => Boolean(action) && allowed(action as never, user),
  );
  return [
    primaryAction(command, t),
    ...own.filter((action) => action.tone !== 'danger'),
    ...routeActions(command, t, hrefOf),
    ...own.filter((action) => action.tone === 'danger'),
  ];
}

/** The rows one viewer gets, in the order given. A row with the id of an earlier one,
 *  a page reached twice, is dropped. Every row's first action is the row itself, and a
 *  row that opens a page can also open it in a new tab or copy its link, for nothing. */
export function visibleCommands(
  commands: readonly CommandDef[],
  user: User,
  t: Translate,
  hrefOf: (command: CommandDef) => string,
): { items: CommandItem[]; byId: ReadonlyMap<string, ResolvedCommand> } {
  const byId = new Map<string, ResolvedCommand>();
  const items: CommandItem[] = [];
  for (const command of commands) {
    const id = commandId(command);
    if (byId.has(id) || !allowed(command, user)) continue;
    const actions = actionsOf(command, user, t, hrefOf);
    const named = actions.map((action, at) => ({ id: `${id}#${at}`, action }));
    byId.set(id, { command, actions: new Map(named.map(({ id: key, action }) => [key, action])) });
    const { label, subtitle, group, icon, image, imageShape, keywords, meta, status, always } =
      command;
    items.push({
      id,
      label,
      subtitle,
      group: group ?? t('commands.groupPage'),
      icon,
      image,
      imageShape,
      keywords,
      meta,
      status,
      always,
      actions: named.map(({ id: key, action }) => ({
        id: key,
        label: action.label,
        icon: action.icon,
        danger: action.tone === 'danger',
      })),
    });
  }
  return { items, byId };
}

function pathOf({ to, params }: CommandDef): string | undefined {
  return Object.entries(params ?? {}).reduce<string | undefined>(
    (path, [key, value]) => path?.replace(`$${key}`, value),
    to,
  );
}

/** The id of the row that is the page at `pathname`, if one is. A row carrying a
 *  `search` is a particular view of a page rather than the page. */
export function commandAt(
  byId: ReadonlyMap<string, ResolvedCommand>,
  pathname: string,
): string | undefined {
  for (const [id, { command }] of byId) {
    if (!command.search && pathOf(command) === pathname) return id;
  }
  return undefined;
}

interface RunContext {
  navigate: ReturnType<typeof useNavigate>;
  confirm: ReturnType<typeof useConfirm>;
  t: Translate;
}

/** Asks first when an action wants that, opens or runs it, says so when it is done if
 *  it names how, and says so when it fails rather than failing silently. */
export async function runAction(
  action: CommandActionDef,
  { navigate, confirm, t }: RunContext,
): Promise<void> {
  try {
    if (action.confirm) {
      const sure = await confirm({
        title: action.confirm.title,
        message: action.confirm.message,
        confirmLabel: action.confirm.confirmLabel ?? action.label,
        cancelLabel: t('common.cancel'),
        destructive: action.tone === 'danger',
      });
      if (!sure) return;
    }
    if (action.to === undefined) await action.run();
    else {
      await navigate({
        to: action.to,
        params: action.params,
        search: action.search,
        hash: action.hash,
      } as Parameters<typeof navigate>[0]);
    }
    if (action.done) toast({ message: action.done, tone: 'success' });
  } catch (error) {
    toast({ message: apiErrorText(error, t('commands.failed')), icon: 'alert-triangle' });
  }
}
