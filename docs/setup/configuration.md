# Configuration reference

Most of KROMA is set up in its web app, under **Server**. Environment variables
cover what the server needs before it starts: ports, folders, hardware and
network. This page lists the ones an operator sets.

Set them under `environment:` in a compose file, or with `-e` on
`docker run`. On the Synology package, add them to
`/var/packages/kroma/var/kroma.conf`, one `export NAME="value"` per line. After a
change, recreate the container with `docker compose up -d`, or restart the
package. A plain restart of an existing container keeps the old values.

Lists take commas. The folder lists also take the system's path separator,
`:` on Linux and macOS, `;` on Windows.

## Ports and addresses

| Variable | Default | What it does |
| --- | --- | --- |
| `KROMA_HOST` | `0.0.0.0` | The network interface to listen on. `0.0.0.0` is every interface. |
| `KROMA_PORT` | `4040` | The HTTP port. The apps search the network on `4040`, so with another port you may have to type the address in each app. |
| `KROMA_WEB_URL` | none | The public address of KROMA, such as `https://kroma.example.com`. Invitation, password reset and TV sign-in links use it, and browsers on that address may use the API. |
| `KROMA_PUBLIC_IP_URL` | `https://api.ipify.org` | A service that returns the server's public IPv4 address, used to recognize apps on the same home network. Empty turns it off. |

## Media and data

| Variable | Default | What it does |
| --- | --- | --- |
| `KROMA_DATA_DIR` | `./data`, and `/data` in the Docker image | Where KROMA keeps its database, images, modules and downloads in progress. Needs read and write access. |
| `KROMA_MOVIES_DIRS` | none | Folders for a library named **Films**. |
| `KROMA_SERIES_DIRS` | none | Folders for a library named **Séries**. |
| `KROMA_MEDIA_DIRS` | none | Folders for one library each, with the type guessed from the content. |
| `KROMA_DEMO_MEDIA` | `1` | With no library, writes small demo videos to the data folder so that playback can be tested. `0` shows the demo titles without files. |
| `KROMA_WATCH_INTERVAL` | `300` | Seconds between two scans of every library. `0` turns the periodic scan off. Changes on a local disk are seen at once either way. |
| `KROMA_WALK_THREADS` | cores × 4, from 8 to 32 | Threads that read folders during a scan. Raise it for network shares. |
| `KROMA_PROBE_WORKERS` | half the cores, from 2 to 4 | Files read at once during a scan. |

The three folder variables define the libraries until you create, edit or
delete one under **Server** > **Sources**. From then on, the libraries are
managed there and the variables are ignored.

## Metadata

| Variable | Default | What it does |
| --- | --- | --- |
| `KROMA_TMDB_API_KEY` | KROMA's own key | Your own key for [TMDB](https://www.themoviedb.org), which provides posters and summaries. |
| `KROMA_TMDB_LANGUAGE` | `en-US` | The language of titles and summaries, such as `fr-FR`. |
| `KROMA_TMDB_ENRICH` | `1` | `0` skips TMDB during scans. |

## Transcoding

| Variable | Default | What it does |
| --- | --- | --- |
| `KROMA_HWACCEL` | found at startup | Forces a conversion method: `qsv`, `vaapi`, `nvenc`, `videotoolbox`, or `software` for the processor. See [Hardware transcoding](hardware-transcoding.md). |
| `KROMA_RENDER_NODE` | `/dev/dri/renderD128` | The graphics device to use when there are several. |
| `KROMA_ENCODE_EFFORT` | chosen from the machine | `quality` or `realtime`, for conversions on the processor. |
| `KROMA_MAX_TRANSCODES` | half the cores, from 1 to 4 | Video conversions at once. A request past the limit is refused, so the player says so instead of stuttering. |
| `KROMA_FFMPEG_CONCURRENCY` | the number of cores minus one | Background media tasks at once, such as thumbnails and subtitle extraction. |

## HTTPS and proxies

| Variable | Default | What it does |
| --- | --- | --- |
| `KROMA_HTTPS` | `0` | `1` also serves HTTPS, with a certificate KROMA makes. See [HTTPS on your home network](network.md#turn-on-https-on-your-home-network). |
| `KROMA_HTTPS_PORT` | `4443` | The HTTPS port. |
| `KROMA_TLS_SANS` | none | Extra addresses and names for the certificate, such as `192.168.1.50,nas.home`. Needed in Docker. |
| `KROMA_HTTPS_REDIRECT` | `0` | `1` sends every HTTP visitor to HTTPS. Breaks TV apps that cannot trust the certificate. |
| `KROMA_TRUSTED_PROXIES` | none | Addresses or IPv4 ranges of reverse proxies whose `X-Forwarded-For` header KROMA believes. See [reverse proxies](network.md#behind-your-own-reverse-proxy). |
| `KROMA_ALLOWED_ORIGINS` | none | Extra web addresses whose pages may use the API. See [another address](network.md#serve-the-web-app-from-another-address). |

## Sign-in provider

These name one OpenID Connect provider, for a setup kept in a compose file.
See [Sign in with your identity provider](single-sign-on.md). Providers added
in **Admin → Sign-in** need none of them.

| Variable | Default | What it does |
| --- | --- | --- |
| `KROMA_OIDC_ISSUER` | none | The provider's issuer URL. The provider exists only when this and the client ID are both set. |
| `KROMA_OIDC_CLIENT_ID` | none | The client ID the provider gave KROMA. |
| `KROMA_OIDC_CLIENT_SECRET` | none | The client secret. Leave it out for a public client. |
| `KROMA_OIDC_LABEL` | none | What the sign-in button says after "Continue with". |

## Logs

| Variable | Default | What it does |
| --- | --- | --- |
| `RUST_LOG` | `info` for KROMA's own parts, `warn` for the rest | How much the server logs, such as `debug`, or `kroma_server=debug` for the server only. Remove it to go back to the default. |
| `KROMA_MODULE_LOG` | the value of `RUST_LOG` | How much the modules log. |

## Modules

| Variable | Default | What it does |
| --- | --- | --- |
| `KROMA_MODULE_ENV` | none | Names of environment variables that programs started by modules may see. By default they see only a short safe list, never the server's own variables. |
| `KROMA_MODULE_HOT_RELOAD` | none | `1` restarts a module when its file changes in the data folder. For module development only. |

## Updates and installation

| Variable | Default | What it does |
| --- | --- | --- |
| `KROMA_UPDATE_DIR` | none | The folder shared with the host updater, which lets **Server updates** install updates in Docker. See [server/updater](../../server/updater/README.md). |
| `KROMA_INSTALL` | set by the image and the package | `docker`, `synology` or `binary`. Decides how **Server updates** installs an update, so do not change it. |
| `KROMA_SELF_UPDATE_DIR` | set by the Synology package | Where the package keeps the server versions it downloads for itself. |
| `KROMA_WEB_DIR` | set by the image and the package | The folder of the web app the server serves. |
| `KROMA_MAIL_RELAY_URL` | `https://mail.kroma.tv` | The relay KROMA sends email through when you choose the relay for email. Change it only if you run your own relay. |

## Ports and folders in the Docker image

| Port | What it serves |
| --- | --- |
| `4040` | the web app, the API and the video streams, over HTTP |
| `4443` | the same over HTTPS, when `KROMA_HTTPS=1` |

| Folder | What it holds |
| --- | --- |
| `/data` | everything KROMA writes: database, images, modules, downloads in progress, certificate |
| your media, for example `/media` | your films and series, at the path you mount them |

The image runs as `root` unless you set `user:`. See
[Docker](docker.md#how-kroma-stores-things).

## For developers and forks

| Variable | Default | What it does |
| --- | --- | --- |
| `KROMA_RELEASES_URL` | KROMA's releases on GitHub | The release feed that **Server updates** reads. |
| `KROMA_STATS_URL` | KROMA's collector | Where the anonymous statistics go. A development build sends none unless this is set. |
| `KROMA_APNS_KEY_P8`, `KROMA_APNS_KEY_ID`, `KROMA_APNS_TEAM_ID`, `KROMA_APNS_TOPIC`, `KROMA_FCM_SERVICE_ACCOUNT` | none | Push credentials for a fork that publishes its own apps. KROMA's own apps push through its relay. |
| `KROMA_EMBED_MODEL_DIR` | none | A model folder passed to the programs the Embeddings module starts. |
