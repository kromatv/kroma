import { KromaApiError } from '@kromatv/client';
import type { Permission, User } from '@kromatv/client/accounts';
import type { useT } from '@kromatv/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommandActionDef, CommandDef } from './command-menu';
import { commandAt, runAction, visibleCommands } from './resolve-commands';

const toast = vi.hoisted(() => vi.fn());
vi.mock('@kromatv/ui/kit', () => ({ toast }));

const t = ((key: string) => key) as unknown as ReturnType<typeof useT>;
const hrefOf = () => '/somewhere';

const viewer = (...permissions: Permission[]) => ({ id: 'viewer', permissions }) as unknown as User;

const action = (label: string, extra: Partial<CommandDef> = {}) =>
  ({ label, run: () => {}, ...extra }) as CommandDef;

const page = (label: string, extra: object = {}) =>
  ({ label, to: '/stats', ...extra }) as unknown as CommandDef;

const resolve = (commands: readonly CommandDef[], user = viewer()) =>
  visibleCommands(commands, user, t, hrefOf);

const labels = (commands: readonly CommandDef[], user = viewer()) =>
  resolve(commands, user).items.map((item) => item.label);

const actionLabels = (command: CommandDef, user = viewer()) =>
  resolve([command], user).items[0]?.actions?.map((one) => one.label);

afterEach(() => {
  vi.clearAllMocks();
});

describe('visibleCommands', () => {
  it('keeps the order it was given', () => {
    expect(labels([action('b'), action('a')])).toEqual(['b', 'a']);
  });

  it('drops a row whose capability the viewer lacks', () => {
    const gated = action('gated', { cap: 'settings.manage' });

    expect(labels([gated], viewer('requests.create'))).toEqual([]);
  });

  it('keeps a row whose capability the viewer holds', () => {
    const gated = action('gated', { cap: 'settings.manage' });

    expect(labels([gated], viewer('settings.manage'))).toEqual(['gated']);
  });

  it('keeps a row when the viewer holds any one of a list', () => {
    const gated = action('gated', { cap: ['library.manage', 'requests.manage'] });

    expect(labels([gated], viewer('requests.manage'))).toEqual(['gated']);
  });

  it('reads a null capability as open to everyone', () => {
    expect(labels([action('open', { cap: null })])).toEqual(['open']);
  });

  it('lists a page reached twice only once, the first way', () => {
    expect(labels([page('first'), page('second')])).toEqual(['first']);
  });

  it('falls through to the second way when the viewer may not have the first', () => {
    expect(labels([page('first', { cap: 'settings.manage' }), page('second')])).toEqual(['second']);
  });

  it('keeps a row to the same route that carries a search of its own', () => {
    const searching = page('Search everywhere', { search: { q: 'dune' } });

    expect(labels([page('Search'), searching])).toEqual(['Search', 'Search everywhere']);
  });

  it('keeps a row to the same route that carries params of its own', () => {
    const detail = page('Detail', { params: { id: 'a' } });

    expect(labels([page('Index'), detail])).toEqual(['Index', 'Detail']);
  });

  it('tells apart two titles that share a route and a name, by their id', () => {
    const title = (id: string) => page('Dune', { id, params: { id } });

    expect(labels([title('a'), title('b')])).toEqual(['Dune', 'Dune']);
  });

  it('tells apart two actions by their label', () => {
    expect(labels([action('a'), action('b')])).toHaveLength(2);
  });

  it('files a row with no group under this page', () => {
    expect(resolve([action('here')]).items[0]?.group).toBe('commands.groupPage');
  });

  it('hands a row’s status over to the palette', () => {
    const status = { label: 'Stopped', tone: 'danger' } as const;

    expect(resolve([action('here', { status })]).items[0]?.status).toEqual(status);
  });

  it('keeps a group it was given', () => {
    expect(resolve([action('here', { group: 'More' })]).items[0]?.group).toBe('More');
  });
});

describe('a row’s actions', () => {
  it('start with opening a row that opens a page', () => {
    expect(actionLabels(page('Stats'))?.[0]).toBe('commands.actionOpen');
  });

  it('start with running a row that only runs', () => {
    expect(actionLabels(action('Scan'))?.[0]).toBe('commands.actionRun');
  });

  it('start with what the row says it does, when it says', () => {
    expect(actionLabels(page('Dune', { primaryLabel: 'Open details' }))?.[0]).toBe('Open details');
  });

  it('put what the developer declared next, so it is what Command Enter runs', () => {
    const row = page('Stats', { actions: [{ label: 'Play', run: () => {} }] });

    expect(actionLabels(row)?.[1]).toBe('Play');
  });

  it('come with a new tab and a copied link for anything that opens a page', () => {
    expect(actionLabels(page('Stats'))).toEqual([
      'commands.actionOpen',
      'commands.actionNewTab',
      'commands.actionCopyLink',
    ]);
  });

  it('come with neither for a row that only runs', () => {
    expect(actionLabels(action('Scan'))).toEqual(['commands.actionRun']);
  });

  it('keep dangerous ones apart at the very end', () => {
    const row = page('Roku', {
      actions: [
        { label: 'Uninstall', tone: 'danger', run: () => {} },
        { label: 'Restart', run: () => {} },
      ],
    });

    expect(actionLabels(row)).toEqual([
      'commands.actionOpen',
      'Restart',
      'commands.actionNewTab',
      'commands.actionCopyLink',
      'Uninstall',
    ]);
  });

  it('mark a dangerous one for the panel', () => {
    const row = action('Roku', {
      actions: [{ label: 'Uninstall', tone: 'danger', run: () => {} }],
    });

    expect(resolve([row]).items[0]?.actions?.at(-1)?.danger).toBe(true);
  });

  it('skip one that does not apply', () => {
    const row = action('Roku', {
      actions: [false, null, undefined, '', { label: 'Restart', run: () => {} }],
    });

    expect(actionLabels(row)).toEqual(['commands.actionRun', 'Restart']);
  });

  it('skip one whose capability the viewer lacks', () => {
    const row = action('Roku', {
      actions: [{ label: 'Restart', cap: 'settings.manage', run: () => {} }],
    });

    expect(actionLabels(row, viewer('requests.create'))).toEqual(['commands.actionRun']);
  });

  it('hand back what to run by the id it listed it under', () => {
    const run = vi.fn();
    const row = action('Roku', { actions: [{ label: 'Restart', run }] });

    const { items, byId } = resolve([row]);
    const listed = items[0]?.actions?.[1]?.id ?? '';
    const found = byId.get(items[0]?.id ?? '')?.actions.get(listed);

    expect(found).toMatchObject({ label: 'Restart', run });
  });
});

describe('commandAt', () => {
  const at = (commands: readonly CommandDef[], pathname: string) =>
    commandAt(resolve(commands).byId, pathname);

  const title = page('Dark', { id: 'title:s1', to: '/shows/$id', params: { id: 's1' } });

  it('finds a plain page by its route', () => {
    expect(at([page('Stats')], '/stats')).toBe('/stats');
  });

  it('finds a title by the route its params fill in', () => {
    expect(at([title], '/shows/s1')).toBe('title:s1');
  });

  it('finds nothing for another title on the same route', () => {
    expect(at([title], '/shows/s2')).toBeUndefined();
  });

  it('does not take a particular view of a page for the page', () => {
    const season = page('Dark', {
      id: 'title:e1',
      to: '/shows/$id',
      params: { id: 's1' },
      search: { season: 2 },
    });

    expect(at([season], '/shows/s1')).toBeUndefined();
  });

  it('finds nothing for a row that opens no route', () => {
    expect(at([action('act')], '/stats')).toBeUndefined();
  });
});

describe('runAction', () => {
  const context = (extra: object = {}) =>
    ({
      navigate: vi.fn().mockResolvedValue(undefined),
      confirm: vi.fn().mockResolvedValue(true),
      t,
      ...extra,
    }) as never;

  const does = (extra: Partial<CommandActionDef> = {}) =>
    ({ label: 'Do', run: vi.fn(), ...extra }) as CommandActionDef;

  it('opens a route with its params, search and hash', async () => {
    const navigate = vi.fn().mockResolvedValue(undefined);
    const route = page('route', {
      to: '/shows/$id',
      params: { id: 's1' },
      search: { season: 2 },
      hash: 'episodes',
    });

    await runAction(route, context({ navigate }));

    expect(navigate).toHaveBeenCalledWith({
      to: '/shows/$id',
      params: { id: 's1' },
      search: { season: 2 },
      hash: 'episodes',
    });
  });

  it('calls a function', async () => {
    const run = vi.fn();

    await runAction(does({ run }), context());

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('says it is done when it names how', async () => {
    await runAction(does({ done: 'Done.' }), context());

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Done.', tone: 'success' }),
    );
  });

  it('asks first when it wants that, and runs on yes', async () => {
    const run = vi.fn();
    const confirm = vi.fn().mockResolvedValue(true);

    await runAction(does({ run, confirm: { title: 'Sure?' } }), context({ confirm }));

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sure?', confirmLabel: 'Do', destructive: false }),
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('asks in red for something dangerous', async () => {
    const confirm = vi.fn().mockResolvedValue(true);

    await runAction(does({ tone: 'danger', confirm: { title: 'Sure?' } }), context({ confirm }));

    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ destructive: true }));
  });

  it('does nothing on no', async () => {
    const run = vi.fn();
    const confirm = vi.fn().mockResolvedValue(false);

    await runAction(
      does({ run, done: 'Done.', confirm: { title: 'Sure?' } }),
      context({ confirm }),
    );

    expect(run).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('says so when a function fails', async () => {
    const run = vi.fn().mockRejectedValue(new Error('nope'));

    await runAction(does({ run }), context());

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: 'commands.failed' }));
  });

  it('says what the server said when it refuses', async () => {
    const refused = new KromaApiError(409, 'refused', { error: 'Not today.' });

    await runAction(does({ run: vi.fn().mockRejectedValue(refused) }), context());

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not today.' }));
  });

  it('does not claim to be done when it failed', async () => {
    const run = vi.fn().mockRejectedValue(new Error('nope'));

    await runAction(does({ run, done: 'Done.' }), context());

    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'Done.' }));
  });
});
