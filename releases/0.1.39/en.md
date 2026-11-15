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

### The web app answers the keyboard
**⌘K** or **Ctrl+K** opens **Quick access**, to go to a page or run an action. In the player, each arrow press seeks 10 seconds, and the volume goes up to 200%.

### A new player on the phone
On the phone, the player opens upright, with navigation and the seek bar under the picture. When playback fails, it says why and offers **Back** and **Try again**.

### The Mac app fills its window
The Mac app uses its whole window, whatever its shape, with no black bars around it. It also plays a film in picture-in-picture, with play, pause and 10-second skips.

## Fixed

- Finishing an episode no longer drops the show from **Continue watching**.
- A paused film no longer starts playing by itself.
- A remux no longer freezes now and then, and resuming mid-film no longer loads forever.
- The Android app connects to a server at an http:// address, as on a home network.
- The next episode keeps your full subtitles, and the web player stays in fullscreen.
- Searching for a show returns the show, not each of its episodes.
- **Play on TV** from a show's page starts the episode instead of doing nothing.
- Shows grouped in one subfolder no longer merge into a single series.
- On iPhone, tapping Play several times no longer starts a film you cannot stop.
- The Linux app no longer opens to a dark window, SteamOS included.

## For the server owner

- Your server sends KROMA one anonymous report a day, unless you turn off **Anonymous usage statistics** in **Admin > General > Privacy**.
- In **Admin > Users**, **Visible libraries** limits a member to the libraries you choose, and **Reset access** creates a link for a forgotten password.
- **Admin > Network** shows where each module connects, with **Block this host** and **Send through the VPN** for each destination.
- At home, apps reach the server at its local address, unencrypted. **Direct connection at home**, in **Admin > Network**, turns it off.
- Modules install on every platform. Before you install one, its **Security** card says what it will read, change and reach.
- If an external qBittorrent or Transmission saves outside your libraries, add its folder to **Download folders** in **Admin > Acquisition**.
- The Synology package shrinks from 158 MB to 32 MB.
- Setup guides are at kroma.tv/docs. On a Samsung TV, `npx @kromatv/installer` installs KROMA with no Tizen Studio.
