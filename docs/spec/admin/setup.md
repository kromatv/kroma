# The guided setup

Status: **AGREED**, from [RFC 719](../../rfcs/719-guided-setup-and-import.md).

What a new owner sees between opening an empty server and its home. The minimum path of
[first-run](README.md#first-run) is still all it takes to play a title. The setup is
everything a server offers after that: the modules that let a television find it, the
people, the devices. An owner who wants none of it says so once and is on the home.

## The shortest path stays the shortest

Status: **AGREED**

**ADMIN-96** (AGREED) - A server with no account opens the guided setup on the web surface.
Each screen asks one decision and shows how far along the owner is.

**ADMIN-97** (AGREED) - The first screen asks the language and one choice: start fresh, or
bring another media server over ([`import.md`](import.md)). The choice only decides which
screens follow.

**ADMIN-98** (AGREED) - The owner account is the second screen, and the only one the owner
cannot skip. Until that account exists the setup changes nothing on the server and contacts
nothing outside it.

Installing a module or signing in to another server is an admin act. Before the owner
exists the server has nobody to hold one against, so the choice made on the first screen
waits for the second.

**ADMIN-99** (AGREED) - Every screen after the owner account can be skipped. A skipped
screen leaves the server as a server without the setup would be.

**ADMIN-100** (AGREED) - Every screen after the owner account offers "Finish later". It
keeps what the owner entered on that screen, ends the setup and opens the home.

**ADMIN-101** (AGREED) - A playing title is three screens away: the first one, the owner
account, and the media with "Finish later".

**ADMIN-102** (AGREED) - Once the owner account exists, the setup remembers where the owner
stopped. Closing the tab, or signing in on another browser, resumes at the same step.

**ADMIN-103** (AGREED) - Only the owner is led through the setup. Anyone else who signs in
lands on the home.

**ADMIN-104** (AGREED) - A server that already has its owner when it is updated to a version
with the setup is asked nothing. It opens no setup and shows no checklist.

## The steps

Status: **AGREED**

In order: the language and the choice, the owner account, the import for an owner who chose
it ([`import.md`](import.md)), then media, modules, people, devices, being counted, and the
home.

**ADMIN-105** (AGREED) - On the media step the owner picks folders in the folder picker.

**ADMIN-106** (AGREED) - The server proposes a kind for each folder from what the folder
holds, and the owner confirms or changes it ([`library/`](../library/), LIB-1).

**ADMIN-107** (AGREED) - The scan starts when the owner confirms the media step, and keeps
running behind every later step.

**ADMIN-108** (AGREED) - A source the server already has when the setup starts appears on
the media step as already added.

**ADMIN-109** (AGREED) - On the modules step each module is offered by what it does for the
household, in one sentence, and never by its id: find this server from the television,
watch away from home, subtitles for anything.

**ADMIN-110** (AGREED) - Which modules the setup offers, and in what order, comes from the
official registry. A module joins or leaves the offer without a server release.

**ADMIN-111** (AGREED) - Each offer shows the module's size, the permissions it asks for and
this server's verdict on it (MOD-23).

**ADMIN-112** (AGREED) - No module is selected by default.

**ADMIN-113** (AGREED) - The modules the owner selects install in the background while the
owner goes on to the next step.

**ADMIN-114** (AGREED) - On the people step the owner creates invitations, under the rule of
[Users](README.md#users): each person sets their own secret. After an import, the
invitations of the accounts it created are already drafted.

**ADMIN-115** (AGREED) - On the devices step the owner can pair a television
([`discovery/`](../discovery/)).

**ADMIN-116** (AGREED) - The devices step gives a link to each KROMA app.

**ADMIN-117** (AGREED) - The being-counted step says in one sentence what a counted server
sends ([Diagnostics](README.md#diagnostics)) and holds its one switch, in the state it has
on any new server.

**ADMIN-118** (AGREED) - The last step is the home.

## The catalogue arrives during the setup

Status: **AGREED**

The best thing the setup can show is the library appearing while the owner is still
answering questions.

**ADMIN-119** (AGREED) - No step holds the catalogue back. A title is playable as soon as
the scan matches it, whichever screen the owner is on.

**ADMIN-120** (AGREED) - While a scan runs, every screen after the media step shows the
titles matched so far. The owner watches the library arrive, not a spinner.

The home does the same once the owner is on it (BROWSE-61).

## What an unfinished setup leaves

Status: **AGREED**

**ADMIN-121** (AGREED) - A setup that ended before its last step leaves a checklist on the
admin dashboard, one line per step not done. A line opens its step.

**ADMIN-122** (AGREED) - A line leaves the checklist when its step is done, in the setup or
anywhere else in the admin console.

| Step | Done when |
|---|---|
| Import | an import has run. The line exists only for an owner who chose to bring a server over |
| Media | the server has a source |
| Modules | the owner installed a module, or confirmed the step with none |
| People | the server has an invitation or a second account |
| Devices | a device other than the owner's first browser has signed in |
| Being counted | the owner confirmed the step |

**ADMIN-123** (AGREED) - The owner can dismiss any line, and a dismissed line does not come
back.

**ADMIN-124** (AGREED) - When no line is left the checklist is gone, and it does not come
back.

## The bar

Status: **AGREED**

**ADMIN-125** (AGREED) - The whole setup works on a phone held upright. Nothing scrolls
sideways and no control is out of reach.

**ADMIN-126** (AGREED) - The whole setup works by keyboard alone, from the first screen to
the last.

**ADMIN-127** (AGREED) - No step sends the owner to documentation. What a step needs to say,
it says on its own screen.

## Backups in the setup

Status: **DESIGN, NOT IMPLEMENTED**

Issue #719 asked for a backup switch beside the statistics one. A switch needs something to
switch on, and the server has no scheduled backup: [Backup and restore](README.md#backup-and-restore)
is an export and an import the owner runs by hand. The setup therefore has no backup step.
It gains one when scheduled backups exist, as one sentence and one switch.

## Not in scope

Status: **AGREED**

- **What an import brings and how it runs** is [`import.md`](import.md).
- **What a television or the desktop app shows on a server nobody owns yet** is
  [`surfaces/`](../surfaces/) (SURF-61). The setup runs on the web surface only (SURF-62).
- **The Store, a module's permissions and its verdict** are [`modules/`](../modules/).
