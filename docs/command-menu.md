# The command menu

`⌘K` on a Mac, `Ctrl+K` on Windows and Linux, or the search button in any
navigation band. It lists the pages and actions this viewer may use, and finds
titles in the library. It belongs to the web client: a television searches with
its keyboard screen instead.

## Adding a command

There is one way in, and it is a hook. `useCommands` lists rows for as long as the
component calling it is mounted, so `run` closes over whatever that component has.

```tsx
const t = useT();
useCommands([{ label: t('content.play'), icon: 'player-play', run: play }]);
```

That row is now in the menu whenever that screen is up, under "This page".

A row that only sometimes applies is written with `&&`, since a falsy entry is
skipped:

```tsx
useCommands([
  playable && { label: t('content.play'), icon: 'player-play', run: play },
  { label: t('content.addToList'), icon: 'bookmark', run: toggle },
]);
```

For a row that belongs everywhere, add it to the hook of its feature, such as
`features/admin/use-admin-commands.ts`:

```ts
{ label: t('admin.updatesCheck'), group, icon: 'refresh', cap: 'settings.manage', run: checkForUpdates },
{ label: t('nav.myList'), group, icon: 'bookmark', to: '/my-list' },
```

`to` opens a route, `run` calls a function, and a rejection becomes a toast with the
server's own words when it sent any. So a command only says what success looks like.

| Field | What it does |
|---|---|
| `label` | The row's text. |
| `subtitle` | A second line, shown and searched: what kind of thing this is, and which one. |
| `to`, `params`, `search`, `hash` | The route to open, and the place on it to jump to. |
| `run` | The function to call instead. |
| `group` | The heading. Left out, "This page". |
| `icon` | A kit icon name, drawn in the square every row's mark shares. |
| `image` | Artwork drawn in place of the icon, which stays as the fallback. |
| `imageShape` | `poster` by default, as wide as an icon's square and taller, which draws the row taller. `tile` fills the same square as an icon, for a module's icon. |
| `keywords` | Searched but never shown: synonyms, in any language. `vpn pare-feu` finds the network page. |
| `meta` | Shown at the end of the row, and searched. |
| `status` | A state drawn as a badge at the very end: `{ label, tone }`, with `neutral`, `success`, `warning` or `danger`. Not searched. |
| `cap` | The capability needed, or a list of which any one will do. |
| `always` | Stays listed whatever is typed, below what matched. For a row the server matched. |
| `primaryLabel` | What Enter and a click do, said at the foot of the menu. Left out, "Ouvrir la page" or "Lancer". |
| `actions` | What else the row can do. See below. |
| `tone`, `confirm`, `done` | Same as on an action. |
| `id` | Only for two rows in one group sharing a label. A plain route is identified by its `to`, so a page reached twice is listed once. |

For anything else that decides who gets a row, write an `if` or a conditional spread:
it is ordinary code.

## Giving a row more to do

A row has a list of actions, as in Raycast. Enter runs the first, `⌘Enter` or
`Ctrl+Enter` the second, and `⌘K` or `Ctrl+K` lists them all in a panel you can filter.

The foot of the menu always says what Enter and a click will do right now, and pressing it does that. The first action is the row itself, so a row with nothing declared still works. A row
that opens a page also gets "Open in a new tab" and "Copy the link" for nothing. Declare
the rest with `actions`, likeliest first:

```ts
{
  label: module.name,
  to: '/admin/modules/$id',
  params: { id: module.id },
  actions: [
    module.enabled && { label: t('commands.moduleDisable'), icon: 'player-pause', run: disable },
    {
      label: t('admin.modulesUninstall'),
      icon: 'trash',
      tone: 'danger',
      confirm: { title: t('admin.modulesUninstall'), message: t('admin.modulesUninstallMsg') },
      done: t('commands.moduleUninstalled'),
      run: uninstall,
    },
  ],
}
```

An action takes `to` or `run` like a row, and `cap`, and a falsy one is skipped.

| Field | What it does |
|---|---|
| `tone: 'danger'` | Drawn in red and moved apart at the end of the panel, so it can never be the first or the second. |
| `confirm` | Asks first, with `title`, and `message` and `confirmLabel` if you want them. The label is the action's by default. |
| `done` | A success toast. A failure already gets one. |

## How search works

`matchText` (`packages/ui/src/lib/text-match.ts`) scores each field from the strongest
reading of what was typed to the weakest:

| What was typed | Finds | Reading |
|---|---|---|
| `films` | Films | The whole text |
| `film` | Films récents | The start of the text |
| `recents` | Films récents | A whole word, accents ignored |
| `jour mises` | Mises à jour | Every word lands on a word, in any order |
| `odul` | Modules | Inside a word |
| `resaeu`, `modlue` | Réseau, Modules | A typo: one edit from 4 letters, two from 9, the same budget the server's search allows |
| `mj` | Mises à jour | Initials |
| `parefeu` | Pare-feu | Separators dropped |
| `mdls` | Modules | Scattered letters, starting on a word |

The label counts in full, then `subtitle` by 0.7, `keywords` by 0.6, `meta` by 0.4 and
`group` by 0.3. Fields the viewer cannot see refuse initials and scattered letters,
because nothing on the row would explain the match. The words of a query can land on
different fields, so `reseau vpn` finds the network page through its keywords.

While something is typed the list is one ranked run with no headings, because a heading
would hold a weak row above a better one in another group. A row names its group at its
end instead, unless it has a `subtitle` or a `meta` to say.

The menu then learns. `command-usage.ts` counts what each profile chooses on each
device and what they had typed, so a row chosen after typing `reseau` rises for `re`.
What is learned only reorders rows that match, and stays under a hit on the whole text.
There is nothing to declare for any of this.

## Adding a page to a navigation

Nothing to do. `CATALOG_NAV` (`features/catalog/catalog-nav.ts`) and `NAV_GROUPS`
(`features/admin/admin-nav.ts`) feed both the sidebar and the menu, and a module's
pages arrive from its manifest's `nav`. The console's rows are exactly what
`adminNavSections` gives its sidebar for this viewer, and none at all for a viewer
the console would turn away.

## Modules

A module's pages are in the menu with nothing to declare: its manifest's `nav` feeds
the sidebar and the menu alike, with its `requires` capability, and a module that is
turned off leaves both. Once something is typed, an admin also finds every installed
module by name, id or description, including one that is off or has no page, and it
opens on its settings.

Each module is listed once. While something is typed its row is a result like a title:
the module's own icon, its version, and a status badge saying it is on, off, stopped or
missing something it needs. What it does stays off the row and is searched, and so is its
status, so `arrêté` lists what has stopped. With nothing typed its page is a plain row of
the console.

The panel on a module's row disables, restarts or uninstalls it, with the same
confirmation as its page, and a second one when other modules depend on it.

A module cannot add its own rows or actions yet. `useCommands` is not part of
`@kromatv/module-sdk`, because no module has needed one.

## Rows that depend on what is typed

`useCommandQuery` reads it. A server knows what the menu cannot see, so a row it
matched through something else must be `always`, or the menu filters it out again.
See `features/catalog/use-library-search-commands.ts`: when one hit is named what was
typed the others are noise and have to match, and when none is, the server found them
in a cast or a synopsis and all of them stay. So `du` stays clean and `tom hardy` works.

```ts
const typed = useCommandQuery().trim();
const query = useDebouncedValue(typed, 180);
const { data = [] } = useQuery({ queryKey: ['commandMenu', 'things', query], queryFn });
const named = data.some((thing) => matchText(thing.name, typed));
useCommands(
  data.map((thing) => ({ id: thing.id, label: thing.name, always: !named, to: '/things' })),
);
```

## Recent

With nothing typed, the places the viewer last went through the menu sit first, per
profile and per device, so `⌘K` then Enter goes back to where they were. Only places
are remembered. A row with `run` never is, because it would sit one Enter from running
again, and neither is one with `search`, which holds one moment's query. There is
nothing to declare for this.

## A new feature's first commands

Write `features/<feature>/use-<feature>-commands.ts` and call it in `CommandMenu`
(`clients/web/src/command-menu.tsx`). That list decides the order of the groups with
nothing typed, and it is the one place allowed to reach several features.

## Opening it from code

`useCommandMenu().open()` from any component. There is no event bus because nothing
outside a component has needed to open it.

## Keep the entry light

`command-menu.tsx`, the feature hooks and the `commands` catalog load in their own
chunk, warmed two seconds after sign-in. `CommandMenuProvider` holds the loaded
component in state rather than using `lazy`, whose Suspense reveal is throttled by
300ms, long enough to lose what the viewer starts typing.

The feature hooks only run while the menu is open. A `useCommands` on a screen runs
with that screen and costs a `Map` write.

The i18n plugin fetches a namespace for any key a module names, so a `commands.*` key
written in the entry chunk would add a request to every page load. That is why the
button's label is `nav.commandMenu`. A screen's own keys already travel with it.

## When the key does nothing

- **Signed out.** The chord stays the browser's.
- **A dialog or drawer is open.** The menu would stack on top of a surface
  waiting for an answer.
- **Fullscreen playback.** The browser only draws the fullscreen element, so the
  menu would take the keyboard without being seen.
