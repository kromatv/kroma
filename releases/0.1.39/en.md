## Action required

- Back up your server before updating, with **Export** in **Admin > Backup**. The update deletes plays nobody watched from the **Watch history**, and the previous version can no longer read the database.
- After updating, accept the module updates waiting in **Admin > Modules > Updates**. Until then, those modules do not start.

## New

### A suggestion when a film ends
On the web and on televisions, the player no longer sits frozen when a film ends. It shows the title most like it, with its synopsis, **Play** and **Home**, and nothing starts on its own.

### Trailers in your language
On the web and on televisions, **Trailer** plays a title's trailer in the KROMA player: dubbed in your language, else subtitled, else in the original. The server needs the Trailers module.

### Faster and smoother
On a Samsung The Frame, the home screen now draws 97% of its frames on time, up from 70%, and the **Movies** grid 90%, up from 34%. On TVs and phones, the film list weighs 1.3 MB instead of 4.9.

## Fixed

- Finishing an episode no longer drops the show from **Continue watching**.
- A paused film no longer starts playing by itself.
- A remux no longer freezes now and then, and resuming mid-film no longer loads forever.
- The Android app connects to a server at an http:// address, as on a home network.
- The next episode keeps your full subtitles, and the web player stays in fullscreen.

## For the server owner

- Your server sends KROMA one anonymous report a day, unless you turn off **Anonymous usage statistics** in **Admin > General > Privacy**.
- In **Admin > Users**, **Visible libraries** limits a member to the libraries you choose, and **Reset access** creates a link for a forgotten password.
- **Admin > Network** shows where each module connects, with **Block this host** and **Send through the VPN** for each destination.
