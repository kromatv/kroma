# First run: your account and your libraries

This guide takes you from a server that has started to your first film
playing in a web browser. It works the same for every way of installing the
server. It takes about ten minutes, plus the time KROMA needs to scan your
files.

## Before you begin

- The KROMA server is running. If not, start with [Docker](docker.md),
  [Synology](synology.md) or [another NAS](other-nas.md).
- You know the server's address on your network, such as
  `192.168.1.50`. On a NAS, it is the address you open its admin page with.
- KROMA can read your media folders. See
  [Media folders and permissions](media-folders.md).
- You use a computer or phone on the same network as the server.

## Open KROMA

In a web browser, go to the server's address on port `4040`:

```
http://192.168.1.50:4040
```

Replace `192.168.1.50` with your server's address. On the computer that runs
the server, `http://localhost:4040` works too.

KROMA shows the form to create an account. If the browser cannot reach the
page, see [Troubleshooting](troubleshooting.md#the-web-page-does-not-open).

## Create the owner account

The first account on a new server is the owner. It has every permission,
including the server settings.

1. Enter an email address, a username and a password of at least 8
   characters.
2. Select **Create account**.

KROMA signs you in and opens the home screen. Until you add your own folders,
it shows a few demo titles, so you can check that playback works.

> [!IMPORTANT]
> Create the owner account from your home network. KROMA refuses it from
> outside, with the message **Create the owner account from the server's local
> network**, so that nobody on the internet can claim a new server before you
> do.

Every account after this one needs an invitation from you. Nobody can sign up
on their own.

## Add your libraries

A library is a set of folders that hold one kind of media: movies or series.
KROMA reads the folder and file names to tell films from episodes, so follow
the [naming rules](media-folders.md#name-your-files) if your files are not
named yet.

1. In the menu, select **Server**. The administration opens.
2. Under **Media**, select **Sources**.
3. Select **Add a library**.
4. In **Name**, enter a name such as `Films`.
5. In **Library type**, choose **Movies** or **Series**.
6. In **First folder**, select **Choose a folder**, then open the folder that
   holds your files.

   > [!NOTE]
   > The folder list shows the server's own view of the disk. In Docker, that
   > is the path inside the container, such as `/media/films`, not the path on
   > your NAS.

7. Select **Create**.

KROMA starts scanning. Posters, summaries and cast appear as it identifies
each title, which takes a few minutes for a few hundred files. Repeat these
steps for your series.

If you installed with the Synology wizard or set `KROMA_MOVIES_DIRS` and
`KROMA_SERIES_DIRS`, KROMA already created a **Films** and a **Séries**
library from those folders. Check them under **Sources** and rename them if
you like.

## Play something

1. Go back to the home screen.
2. Open a film and select **Play**.

If the film plays, the server works. KROMA sends the file as it is to any
screen that can play it, and converts it only when a screen cannot.

## Invite the people you share with

1. In the menu, select **Invite a user**.
2. Choose what they may do, and how long the link stays valid.
3. Select **Create invitation link**, then send them the link.

They open the link, create their account, and see your libraries.

## Next steps

- Put the app on your TV: [TVs](tv.md).
- Put the app on your phone: [Phones and tablets](mobile.md).
- Add more features, such as subtitles or downloads, under **Server** >
  **Modules**.
