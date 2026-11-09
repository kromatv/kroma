# Writing documentation

How the user-facing documentation in this repository is written: the setup
guides in [`docs/setup/`](setup/README.md), the root README, and any page a
person reads to install, configure or fix KROMA. Code comments follow
[CODE_STYLE.md](../CODE_STYLE.md) instead.

The rules come from published style guides and from install pages that work
well. Each one links to its source, so the reason is never "because I said so".

## Who reads these pages

Assume the reader:

- owns the NAS or the TV, but has never opened a terminal on it;
- reads English as a second language;
- arrived from a search engine, on the one page that matches their device, and
  has not read the others.

So every page stands alone, uses short sentences, and says what the reader
will have when they finish.

## One page, one job

Every page is one of four types, and never two at once
([Diátaxis](https://diataxis.fr/start-here/)):

| Type | It answers | Example |
| --- | --- | --- |
| Tutorial | "Show me, start to finish." One path, no choices. | [First run](setup/first-run.md) |
| How-to guide | "How do I do this one thing?" | [Install on a Synology NAS](setup/synology.md) |
| Reference | "What does this setting do?" Consulted, not read. | [Configuration](setup/configuration.md) |
| Explanation | "Why does it work this way?" | [ARCHITECTURE.md](../ARCHITECTURE.md) |

A tutorial offers no alternatives. It names the one path and links the others
([Diátaxis](https://diataxis.fr/tutorials-how-to/)). A how-to guide may branch,
but each branch gets its own heading, most common first
([Google](https://developers.google.com/style/procedures)).

## The shape of a how-to guide

```
# Install KROMA on a Synology NAS        verb first, never "Installing"

One or two sentences: who this is for and what they will have at the end.

## Before you begin                      what must already be true, as a list

## Step heading                          numbered steps, one action each
## Next step heading
## Check that it works                   what the reader should see
## Optional: extra heading               optional work is labelled at the start
## Troubleshooting                       symptom as the heading, then cause, then fix
## Next steps                            two or three links, no more
```

Prerequisites go before step 1, never in a note after the step they block
([Google](https://developers.google.com/style/notices),
[GitLab](https://docs.gitlab.com/development/documentation/topic_types/task/)).

## Steps

- One action per numbered step, as a full sentence that starts with a verb.
  A menu path counts as one action: **Control Panel** > **Shared Folder**
  ([Microsoft](https://learn.microsoft.com/en-us/style-guide/procedures-instructions/writing-step-by-step-instructions)).
- Say where before what: "In DSM, open **Package Center**", not "Open
  **Package Center** in DSM" ([Google](https://developers.google.com/style/procedures)).
- Put the condition before the instruction: "If your films are on a NAS,
  mount them read-write" ([Diátaxis](https://diataxis.fr/how-to-guides/)).
- Give the result right after the action: "Run `docker compose up -d`. Docker
  downloads the image and starts KROMA." A reader who does not see the result
  knows to stop ([Diátaxis](https://diataxis.fr/tutorials/)).
- A procedure with one step is a sentence, not a list of one.
- An optional step starts with "Optional:".

## Commands and code

- Introduce a command by what it does, ending with a colon: "Start the
  server:". Never "run the following command".
- Every block copies and runs as it is. No `<angle brackets>`, which a shell
  reads as a redirect, no `...`, no prompt character
  ([Google](https://developers.google.com/style/code-syntax)).
- When a value must change, write it as `UPPER_SNAKE_CASE` or as a realistic
  example, then say right below the block what to replace it with
  ([Google](https://developers.google.com/style/placeholders)).
- Show output only when it helps the reader check their work, in its own block,
  introduced by "The output looks like this:".
- Code font for anything typed or read exactly: commands, paths, ports,
  variables, file names. Bold for what is on screen: buttons, menus, tabs.
  Never quotes around either
  ([Google](https://developers.google.com/style/code-in-text)).

## Words

- Write to "you", in the active voice, present tense.
- Short sentences. One idea each. If a reader has to go back to parse it,
  split it.
- No "simply", "just", "easy", "quickly", "please", or "!". A reader stuck on
  an "easy" step feels stupid
  ([Google](https://developers.google.com/style/tone)).
- No contractions. They are harder for readers of English as a second
  language.
- No em dashes and no en dashes, as everywhere in this repository
  ([CONVENTIONS.md](../CONVENTIONS.md#no-em-dashes)).
- One name per thing. If the page says "media folder", it says "media folder"
  every time, never "library path" two lines later.
- Headings in sentence case, no final full stop
  ([Google](https://developers.google.com/style/headings)).
- Link text names the destination: "see [Hardware transcoding](setup/hardware-transcoding.md)",
  never "click here" ([Google](https://developers.google.com/style/link-text)).

## Notes and warnings

GitHub renders alerts, and the site renders the same syntax as a callout:

```markdown
> [!NOTE]
> Useful, but the reader can skip it.

> [!WARNING]
> Data loss, a security risk, or something that cannot be undone.
```

Use `NOTE`, `TIP`, `IMPORTANT`, `WARNING` and `CAUTION` only. Never two in a
row, and never a required step inside one
([Google](https://developers.google.com/style/notices)).

## Troubleshooting

The heading is what the reader sees: the error text or the symptom. The body
gives the cause in one sentence, then the fix as steps
([GitLab](https://docs.gitlab.com/development/documentation/topic_types/troubleshooting/)).
Quote error messages exactly, so a search finds them.

## Docker and permissions

These are the questions readers get wrong most often, so every guide that
touches them answers them the same way:

1. Which side of a mapping to edit. `/volume1/video:/media` is
   `HOST:CONTAINER`: change the part before the colon, keep the part after it
   ([linuxserver.io](https://docs.linuxserver.io/general/volumes/)).
2. Why the mount is there: a container forgets everything not stored in a
   mounted folder or a volume.
3. Who owns new files: the user the container runs as. KROMA's image runs as
   root unless `user:` says otherwise.
4. Read or read-write: say which folders KROMA writes to, and why.

## Keep it true

- Test every install path on a clean machine before it is documented, and
  again when it changes. A step nobody ran is a bug report waiting to happen
  ([readme checklist](https://github.com/ddbeck/readme-checklist/blob/main/checklist.md)).
- Platform facts (a DSM menu, a TV's developer mode) come from the vendor's own
  documentation. Link it where the reader needs it.
- When the product changes a screen, a setting or a default, the guide changes
  in the same pull request.

## Where the pages live

The English guides are in [`docs/setup/`](setup/README.md). The website
renders the same files at [kroma.tv/docs](https://kroma.tv/docs), with French
translations in [`apps/www/content/docs/`](../apps/www/content/docs). Two rules
keep both readable:

- Link between guides with a relative path (`[Docker](docker.md)`). The site
  turns it into its own page link. Any other repository path becomes a GitHub
  link.
- No front matter and no HTML. GitHub shows front matter as a table, and the
  site reads the title from the first `#` heading and the summary from the
  first paragraph.

A French page is written from the English one, not translated word by word,
and follows the same rules. It links exactly like the English page.
