# Référence de configuration

La plus grande partie de KROMA se configure dans son application web, sous
**Serveur**. Les variables d'environnement couvrent ce dont le serveur a besoin
avant de démarrer : ports, dossiers, matériel et réseau. Cette page liste
celles qu'un administrateur définit.

Définissez-les sous `environment:` dans un fichier compose, ou avec `-e` sur
`docker run`. Avec le paquet Synology, ajoutez-les dans
`/var/packages/kroma/var/kroma.conf`, une ligne `export NAME="value"` par
variable. Après une modification, recréez le conteneur avec
`docker compose up -d`, ou redémarrez le paquet. Redémarrer un conteneur
existant sans le recréer conserve les anciennes valeurs.

Les listes se séparent par des virgules. Les listes de dossiers acceptent aussi
le séparateur de chemins du système : `:` sous Linux et macOS, `;` sous
Windows.

## Ports et adresses

| Variable | Valeur par défaut | Rôle |
| --- | --- | --- |
| `KROMA_HOST` | `0.0.0.0` | L'interface réseau sur laquelle écouter. `0.0.0.0` désigne toutes les interfaces. |
| `KROMA_PORT` | `4040` | Le port HTTP. Les apps cherchent un serveur sur `4040` : avec un autre port, vous devrez peut-être saisir l'adresse dans chaque app. |
| `KROMA_WEB_URL` | aucune | L'adresse publique de KROMA, comme `https://kroma.example.com`. Les liens d'invitation, de réinitialisation du mot de passe et de connexion d'un téléviseur l'utilisent, et les navigateurs sur cette adresse peuvent utiliser l'API. |
| `KROMA_PUBLIC_IP_URL` | `https://api.ipify.org` | Un service qui renvoie l'adresse IPv4 publique du serveur, utilisée pour reconnaître les apps sur le même réseau local. Une valeur vide le désactive. |

## Médias et données

| Variable | Valeur par défaut | Rôle |
| --- | --- | --- |
| `KROMA_DATA_DIR` | `./data`, et `/data` dans l'image Docker | L'endroit où KROMA conserve sa base de données, ses images, ses modules et les téléchargements en cours. Doit être accessible en lecture et en écriture. |
| `KROMA_MOVIES_DIRS` | aucune | Dossiers d'une bibliothèque nommée **Films**. |
| `KROMA_SERIES_DIRS` | aucune | Dossiers d'une bibliothèque nommée **Séries**. |
| `KROMA_MEDIA_DIRS` | aucune | Dossiers d'une bibliothèque chacun, avec le type deviné d'après le contenu. |
| `KROMA_DEMO_MEDIA` | `1` | Sans bibliothèque, écrit de petites vidéos de démonstration dans le dossier de données pour tester la lecture. `0` affiche les titres de démonstration sans fichiers. |
| `KROMA_WATCH_INTERVAL` | `300` | Secondes entre deux scans de toutes les bibliothèques. `0` désactive le scan périodique. Dans les deux cas, les changements sur un disque local sont vus immédiatement. |
| `KROMA_WALK_THREADS` | cœurs × 4, de 8 à 32 | Threads qui lisent les dossiers pendant un scan. Augmentez-le pour les partages réseau. |
| `KROMA_PROBE_WORKERS` | la moitié des cœurs, de 2 à 4 | Fichiers lus en même temps pendant un scan. |

Les trois variables de dossiers définissent les bibliothèques jusqu'à ce que
vous en créiez, modifiiez ou supprimiez une dans **Serveur** > **Sources**.
Ensuite, les bibliothèques se gèrent là, et les variables sont ignorées.

## Métadonnées

| Variable | Valeur par défaut | Rôle |
| --- | --- | --- |
| `KROMA_TMDB_API_KEY` | la clé de KROMA | Votre propre clé pour [TMDB](https://www.themoviedb.org), qui fournit les affiches et les résumés. |
| `KROMA_TMDB_LANGUAGE` | `en-US` | La langue des titres et des résumés, comme `fr-FR`. |
| `KROMA_TMDB_ENRICH` | `1` | `0` ignore TMDB pendant les scans. |

## Transcodage

| Variable | Valeur par défaut | Rôle |
| --- | --- | --- |
| `KROMA_HWACCEL` | détecté au démarrage | Impose une méthode de conversion : `qsv`, `vaapi`, `nvenc`, `videotoolbox`, ou `software` pour le processeur. Consultez [Transcodage matériel](hardware-transcoding.md). |
| `KROMA_RENDER_NODE` | `/dev/dri/renderD128` | Le périphérique graphique à utiliser quand il y en a plusieurs. |
| `KROMA_ENCODE_EFFORT` | choisi selon la machine | `quality` ou `realtime`, pour les conversions sur le processeur. |
| `KROMA_MAX_TRANSCODES` | la moitié des cœurs, de 1 à 4 | Conversions vidéo simultanées. Une demande au-delà de la limite est refusée : le lecteur l'indique au lieu de saccader. |
| `KROMA_FFMPEG_CONCURRENCY` | le nombre de cœurs moins un | Tâches média simultanées en arrière-plan, comme les miniatures et l'extraction des sous-titres. |

## HTTPS et proxys

| Variable | Valeur par défaut | Rôle |
| --- | --- | --- |
| `KROMA_HTTPS` | `0` | `1` sert aussi HTTPS, avec un certificat créé par KROMA. Consultez [HTTPS sur votre réseau local](network.md#activer-https-sur-votre-réseau-local). |
| `KROMA_HTTPS_PORT` | `4443` | Le port HTTPS. |
| `KROMA_TLS_SANS` | aucune | Adresses et noms supplémentaires pour le certificat, comme `192.168.1.50,nas.home`. Nécessaire dans Docker. |
| `KROMA_HTTPS_REDIRECT` | `0` | `1` redirige chaque visiteur HTTP vers HTTPS. Bloque les apps TV qui ne peuvent pas faire confiance au certificat. |
| `KROMA_TRUSTED_PROXIES` | aucune | Adresses ou plages IPv4 des reverse proxys dont KROMA croit l'en-tête `X-Forwarded-For`. Consultez [reverse proxy](network.md#derrière-votre-propre-reverse-proxy). |
| `KROMA_ALLOWED_ORIGINS` | aucune | Adresses web supplémentaires dont les pages peuvent utiliser l'API. Consultez [une autre adresse](network.md#servir-lapplication-web-depuis-une-autre-adresse). |

## Journaux

| Variable | Valeur par défaut | Rôle |
| --- | --- | --- |
| `RUST_LOG` | `info` pour les parties de KROMA, `warn` pour le reste | Le niveau de détail des journaux du serveur, comme `debug`, ou `kroma_server=debug` pour le serveur seul. Retirez-la pour revenir à la valeur par défaut. |
| `KROMA_MODULE_LOG` | la valeur de `RUST_LOG` | Le niveau de détail des journaux des modules. |

## Modules

| Variable | Valeur par défaut | Rôle |
| --- | --- | --- |
| `KROMA_MODULE_ENV` | aucune | Noms des variables d'environnement que les programmes lancés par les modules peuvent voir. Par défaut, ils ne voient qu'une courte liste sûre, jamais les variables du serveur lui-même. |
| `KROMA_MODULE_HOT_RELOAD` | aucune | `1` redémarre un module quand son fichier change dans le dossier de données. Réservé au développement de modules. |

## Mises à jour et installation

| Variable | Valeur par défaut | Rôle |
| --- | --- | --- |
| `KROMA_UPDATE_DIR` | aucune | Le dossier partagé avec l'outil de mise à jour hôte, qui permet à **Mises à jour du serveur** d'installer les mises à jour dans Docker. Consultez [server/updater](../../server/updater/README.md). |
| `KROMA_INSTALL` | défini par l'image et le paquet | `docker`, `synology` ou `binary`. Décide comment **Mises à jour du serveur** installe une mise à jour : ne la modifiez pas. |
| `KROMA_SELF_UPDATE_DIR` | défini par le paquet Synology | L'endroit où le paquet conserve les versions du serveur qu'il télécharge pour lui-même. |
| `KROMA_WEB_DIR` | défini par l'image et le paquet | Le dossier de l'application web que sert le serveur. |
| `KROMA_MAIL_RELAY_URL` | `https://mail.kroma.tv` | Le relais par lequel KROMA envoie les e-mails quand vous choisissez le relais pour l'envoi d'e-mails. Ne le changez que si vous gérez votre propre relais. |

## Ports et dossiers de l'image Docker

| Port | Ce qu'il sert |
| --- | --- |
| `4040` | l'application web, l'API et les flux vidéo, en HTTP |
| `4443` | la même chose en HTTPS, quand `KROMA_HTTPS=1` |

| Dossier | Ce qu'il contient |
| --- | --- |
| `/data` | tout ce que KROMA écrit : base de données, images, modules, téléchargements en cours, certificat |
| vos médias, par exemple `/media` | vos films et séries, au chemin où vous les montez |

L'image s'exécute en tant que `root`, sauf si vous définissez `user:`. Consultez
[Docker](docker.md#où-kroma-garde-ses-données).

## Pour les développeurs et les forks

| Variable | Valeur par défaut | Rôle |
| --- | --- | --- |
| `KROMA_RELEASES_URL` | les versions de KROMA sur GitHub | Le flux de versions que lit **Mises à jour du serveur**. |
| `KROMA_STATS_URL` | le collecteur de KROMA | La destination des statistiques anonymes. Une version de développement n'envoie rien sans cette variable. |
| `KROMA_APNS_KEY_P8`, `KROMA_APNS_KEY_ID`, `KROMA_APNS_TEAM_ID`, `KROMA_APNS_TOPIC`, `KROMA_FCM_SERVICE_ACCOUNT` | aucune | Les identifiants de notification d'un fork qui publie ses propres applications. Les applications de KROMA passent par son relais. |
| `KROMA_EMBED_MODEL_DIR` | aucune | Un dossier de modèle transmis aux programmes que lance le module Embeddings. |
