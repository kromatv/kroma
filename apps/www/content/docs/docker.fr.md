# Installer KROMA avec Docker

Ce guide fait tourner le serveur KROMA dans un conteneur Docker sous Linux, sur
un Raspberry Pi 4 ou 5, ou sur un Mac ou un ordinateur Windows avec Docker
Desktop. À la fin, KROMA démarre avec l'ordinateur, sert son application web
sur le port `4040` et lit vos dossiers de médias là où ils se trouvent déjà.

Sur un NAS, suivez plutôt [Synology](synology.md) ou [Autres NAS](other-nas.md) :
ces guides utilisent la même image, avec les menus de votre NAS.

## Avant de commencer

- Un système 64 bits sur un processeur x86-64 ou ARM64. Sur un Raspberry Pi,
  cela veut dire Raspberry Pi OS en 64 bits : `dpkg --print-architecture`
  affiche `arm64`. Le système 32 bits affiche `armhf` et ne peut pas faire
  tourner KROMA.
- Docker Engine avec le plugin Compose, ou Docker Desktop. Si
  `docker compose version` affiche un numéro de version, vous avez les deux.
  Sinon, suivez [Installer Docker Engine](https://docs.docker.com/engine/install/) ou
  [Docker Desktop](https://docs.docker.com/desktop/).
- Le dossier qui contient vos films et vos séries, par exemple `/srv/media`.
  Voir [Dossiers de médias et permissions](media-folders.md) pour savoir comment
  nommer son contenu.

## Où KROMA garde ses données

Un conteneur est jetable : Docker efface tout ce qu'il contient quand il le
remplace, par exemple lors d'une mise à jour. KROMA ne garde donc rien
d'important dans le conteneur. Il utilise deux dossiers qui se trouvent sur
votre ordinateur et que Docker présente au conteneur :

| Sur votre ordinateur | Dans le conteneur | Ce qu'il contient | Accès |
| --- | --- | --- | --- |
| `~/kroma/data` | `/data` | la base de données de KROMA, ses réglages, les affiches, les modules installés, les téléchargements en cours | lecture et écriture |
| `/srv/media` | `/media` | vos films et vos séries | lecture, et écriture si KROMA télécharge pour vous |

Dans le fichier compose, chaque ligne sous `volumes:` se lit `ON_YOUR_COMPUTER:IN_THE_CONTAINER`.
Modifiez la partie avant les deux-points pour qu'elle corresponde à votre
ordinateur. Laissez la partie après les deux-points telle quelle.

KROMA écrit ses fichiers sous l'identité de l'utilisateur qui exécute le
conteneur. Le fichier compose ci-dessous l'exécute avec votre propre
utilisateur. Ainsi, les fichiers que KROMA crée dans votre dossier de médias
vous appartiennent, comme si vous les aviez créés vous-même.

## Installer KROMA

1. Trouvez votre ID utilisateur et votre ID de groupe :

   ```bash
   id -u
   id -g
   ```

   Notez les deux nombres. Sur la plupart des systèmes Linux, le premier
   utilisateur a `1000` et `1000`. Sur un Mac, c'est en général `501` et `20`.

2. Créez un dossier pour KROMA, avec un dossier `data` à l'intérieur, et
   placez-vous dedans :

   ```bash
   mkdir -p ~/kroma/data
   cd ~/kroma
   ```

   Créez `data` vous-même, maintenant. Si c'est Docker qui le crée, il
   appartient à `root`, et KROMA ne peut pas y écrire.

3. Dans ce dossier, créez un fichier nommé `docker-compose.yml` avec ce
   contenu :

   ```yaml
   services:
     kroma:
       image: ghcr.io/kromatv/kroma:latest
       container_name: kroma
       restart: unless-stopped
       user: "1000:1000"
       ports:
         - "4040:4040"
       volumes:
         - ./data:/data
         - /srv/media:/media
   ```

   Remplacez les valeurs suivantes :

   - `1000:1000` : votre ID utilisateur et votre ID de groupe de l'étape 1.
   - `/srv/media` : le dossier qui contient vos films et vos séries.

4. Vérifiez que votre utilisateur peut écrire dans votre dossier de médias :

   ```bash
   touch /srv/media/kroma-test && rm /srv/media/kroma-test
   ```

   Si la commande affiche `Permission denied`, KROMA ne pourra pas y écrire non
   plus. Un accès en lecture seule suffit pour regarder : voir
   [Monter vos dossiers de médias](#monter-vos-dossiers-de-médias).

5. Démarrez KROMA :

   ```bash
   docker compose up -d
   ```

   Docker télécharge l'image, environ 100 Mo, et démarre le conteneur.

## Vérifier que tout fonctionne

1. Lisez le journal :

   ```bash
   docker compose logs kroma
   ```

   Les dernières lignes contiennent `KROMA listening on http://0.0.0.0:4040`.

2. Dans un navigateur sur le même réseau, ouvrez `http://SERVER_IP:4040`.
   Remplacez `SERVER_IP` par l'adresse de l'ordinateur qui exécute Docker, par
   exemple `192.168.1.50`. Sur cet ordinateur lui-même,
   `http://localhost:4040` fonctionne aussi.

KROMA affiche le formulaire de création du compte propriétaire. Poursuivez avec
[Premier démarrage](first-run.md). Quand vous ajoutez une bibliothèque,
choisissez le dossier sous `/media` : c'est là que votre dossier de médias
apparaît dans le conteneur.

## Monter vos dossiers de médias

La ligne `- /srv/media:/media` fait apparaître le dossier `/srv/media` de votre
ordinateur sous le nom `/media` dans le conteneur. KROMA ne voit que les
dossiers que vous montez.

**Plusieurs dossiers.** Montez chacun d'eux sous `/media` :

```yaml
    volumes:
      - ./data:/data
      - /mnt/disk1/films:/media/films
      - /mnt/disk2/series:/media/series
```

**Lecture seule.** Si vous regardez seulement ce que vous avez déjà, ajoutez
`:ro` à la fin d'une ligne de médias. KROMA peut alors lire le dossier, sans
jamais rien y modifier :

```yaml
      - /srv/media:/media:ro
```

Avec `:ro`, le module **Acquisition** ne peut pas importer de téléchargements
dans ce dossier. Retirez `:ro` quand vous voulez qu'il le fasse.

**Liens.** Si votre bibliothèque contient des liens symboliques vers des
fichiers situés ailleurs, montez aussi le dossier vers lequel pointent les
liens, au même chemin que sur votre ordinateur. Un lien vers un dossier que le
conteneur ne voit pas ne peut pas être ouvert.

**Partages réseau.** Si vos médias sont sur un autre NAS, montez d'abord le
partage sur l'ordinateur qui exécute Docker, puis montez ce dossier dans le
conteneur comme ci-dessus.

## Mettre à jour KROMA

Téléchargez la nouvelle image et recréez le conteneur :

```bash
cd ~/kroma
docker compose pull
docker compose up -d
```

Vos données et vos réglages restent dans `~/kroma/data`. Dans KROMA,
**Serveur** > **Mises à jour du serveur** vous indique quand une nouvelle
version sort. Pour que KROMA installe lui-même les mises à jour, mettez en place
l'outil de mise à jour hôte décrit dans
[Mises à jour et sauvegardes](updates.md#docker).

L'image a plusieurs tags :

| Tag | Ce qu'il suit |
| --- | --- |
| `latest` | le build le plus récent, fait à chaque changement : le canal Canary |
| `stable` | la version publiée la plus récente : le canal Stable |
| `0.1` | la version 0.1 publiée la plus récente |
| `0.1.39` | cette version précise, qui ne change jamais |

Chaque build a aussi son propre tag, comme `0.1.39.3607024`. Épinglez une
version ou un build pour choisir le moment de vos mises à jour.

## Arrêter ou supprimer KROMA

Arrêtez le serveur, puis redémarrez-le plus tard :

```bash
docker compose stop
docker compose start
```

Supprimez le conteneur. Vos données restent dans `~/kroma/data` :

```bash
docker compose down
```

Pour tout supprimer, effacez `~/kroma` après `docker compose down`. Vos dossiers
de médias ne sont jamais touchés.

## Facultatif : transcodage matériel

Si l'ordinateur a un processeur Intel avec puce graphique, KROMA peut s'en
servir pour convertir les vidéos qu'un écran ne peut pas lire, au lieu
d'utiliser le processeur lui-même. Ajoutez le périphérique et le groupe qui a le
droit de l'ouvrir :

```yaml
       devices:
         - /dev/dri:/dev/dri
       group_add:
         - "993"
```

Remplacez `993` par l'ID du groupe `render` sur votre ordinateur :

```bash
getent group render | cut -d: -f3
```

Voir [Transcodage matériel](hardware-transcoding.md) pour les cartes NVIDIA et
pour vérifier que cela fonctionne.

## Facultatif : exécuter en root

Si vous omettez la ligne `user:`, KROMA s'exécute en tant que `root` dans le
conteneur. Il peut alors lire et écrire dans n'importe quel dossier monté, mais
chaque fichier qu'il crée appartient à `root`, et votre propre compte risque de
ne pas pouvoir le renommer ni le supprimer. L'exécution en root permet aussi de
garder les données dans un volume Docker plutôt que dans un dossier :

```yaml
services:
  kroma:
    image: ghcr.io/kromatv/kroma:latest
    container_name: kroma
    restart: unless-stopped
    ports:
      - "4040:4040"
    volumes:
      - kroma-data:/data
      - /srv/media:/media

volumes:
  kroma-data:
```

Un volume Docker et une ligne `user:` ne fonctionnent pas ensemble : Docker crée
le volume pour `root`, et KROMA s'arrête avec
`unable to open database file: /data/kroma.db`.

## Facultatif : un seul montage pour les données et les médias

Quand le module Acquisition importe un téléchargement, il peut créer un lien
physique au lieu d'une copie. C'est instantané et cela n'occupe aucun espace
supplémentaire. Cela ne fonctionne que si le téléchargement et la bibliothèque
sont dans le même montage. Avec des montages séparés, comme `./data` et
`/srv/media`, le fichier est toujours copié.

Pour obtenir des liens physiques, placez le dossier de données de KROMA sur le
même disque que vos médias, et montez une seule fois leur dossier parent
commun :

```yaml
       environment:
         KROMA_DATA_DIR: /srv/kroma-data
       volumes:
         - /srv:/srv
```

Vos médias se trouvent alors aussi à `/srv/media` dans le conteneur. Avant de
démarrer KROMA, créez `/srv/kroma-data`, avec pour propriétaire l'utilisateur
indiqué dans `user:`.

## Facultatif : exécuter sans Compose

La même installation, en une seule commande :

```bash
docker run -d --name kroma --restart unless-stopped \
  --user 1000:1000 \
  -p 4040:4040 \
  -v ~/kroma/data:/data \
  -v /srv/media:/media \
  ghcr.io/kromatv/kroma:latest
```

## Dépannage

### `Bind for 0.0.0.0:4040 failed: port is already allocated`

Un autre programme utilise le port `4040`. Modifiez la partie avant les
deux-points, par exemple `"4041:4040"`, puis ouvrez KROMA sur le port `4041`.
Les applications cherchent le serveur sur le port `4040` de votre réseau et
risquent de ne pas le trouver : saisissez l'adresse dans chaque application.

### `unable to open database file: /data/kroma.db`

KROMA ne peut pas écrire dans son dossier de données. Soit le dossier appartient
à un autre utilisateur que celui de `user:`, soit le fichier compose utilise un
volume Docker avec `user:`. Créez `~/kroma/data` vous-même et utilisez
`./data:/data`, ou donnez le dossier à votre utilisateur :

```bash
sudo chown -R 1000:1000 ~/kroma/data
```

### Une bibliothèque reste vide

KROMA ne peut pas lire le dossier, ou le dossier n'est pas monté. Voir
[Dépannage](troubleshooting.md#une-bibliothèque-reste-vide-après-une-analyse).

### Les applications ne trouvent pas le serveur

Les applications cherchent un serveur sur le port `4040` de votre réseau. Si
vous avez changé le port, ou si le téléviseur est sur un autre réseau, comme un
Wi-Fi invité, saisissez l'adresse dans l'application : `http://SERVER_IP:4040`.

## Étapes suivantes

- [Premier démarrage](first-run.md) : créez votre compte et ajoutez vos
  bibliothèques.
- [Téléviseurs](tv.md) : installez KROMA sur votre téléviseur.
- [Référence de configuration](configuration.md) : chaque réglage que vous
  pouvez passer dans `environment:`.
