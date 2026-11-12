# Installer KROMA sur QNAP, Unraid ou TrueNAS

Ces NAS font tourner KROMA avec la même image Docker que n'importe quel
ordinateur Linux. Ce guide donne les étapes dans le gestionnaire d'applications
de chacun. Les notions sur lesquelles elles reposent, par exemple ce qu'est un
montage et pourquoi les permissions comptent, sont expliquées dans
[Docker](docker.md#où-kroma-garde-ses-données).

Pour un NAS Synology, consultez [Synology](synology.md).

## QNAP

Il vous faut QTS 5.1 ou QuTS hero h5.1, ou une version plus récente, avec
**Container Station** 3 installé depuis l'**App Center**.

1. Dans **File Station**, créez un dossier pour les données de KROMA, par
   exemple `Container/kroma/data`.
2. Ouvrez **Container Station**, puis **Applications** > **Créer**. Sur les
   versions récentes, le bouton se trouve sous **Explorer** > **Créer une
   application**.
3. Dans **Nom de l'application**, saisissez `kroma`.
4. Collez ce YAML :

   ```yaml
   services:
     kroma:
       image: ghcr.io/kromatv/kroma:latest
       container_name: kroma
       restart: unless-stopped
       ports:
         - "4040:4040"
       volumes:
         - /share/Container/kroma/data:/data
         - /share/Multimedia:/media
   ```

   Sur un QNAP, chaque dossier partagé se trouve sous `/share`. Remplacez
   `Multimedia` par le dossier partagé qui contient vos médias, tel que
   **File Station** le nomme, et `Container/kroma/data` par le dossier de
   l'étape 1.

5. Sélectionnez **Valider**, puis **Créer**.

Container Station télécharge l'image et démarre KROMA. Ouvrez
`http://NAS_IP:4040` et poursuivez avec [Premier démarrage](first-run.md). Quand
vous ajoutez une bibliothèque, vos médias se trouvent sous `/media`.

Pour mettre à jour, ouvrez l'application dans **Container Station** et
recréez-la, ou exécutez `docker compose pull` puis `docker compose up -d` en SSH,
dans le dossier de l'application.

## Unraid

Unraid n'a pas de Docker Compose intégré : vous ajoutez donc KROMA comme
conteneur dans l'onglet **Docker**.

1. Dans l'onglet **Docker**, sélectionnez **Add Container**.
2. Remplissez :
   - **Name** : `kroma`
   - **Repository** : `ghcr.io/kromatv/kroma:latest`
   - **Network Type** : `Bridge`
3. Sélectionnez trois fois **Add another Path, Port, Variable, Label or
   Device**, et ajoutez :

   | Type | Nom | Conteneur | Hôte | Mode d'accès |
   | --- | --- | --- | --- | --- |
   | Port | Web | `4040` | `4040` | |
   | Path | Data | `/data` | `/mnt/user/appdata/kroma` | Read/Write |
   | Path | Media | `/media` | `/mnt/user/media` | Read Only, ou Read/Write pour le module Acquisition |

   Remplacez `/mnt/user/media` par le partage qui contient vos médias.

4. Sélectionnez **Apply**.

Unraid crée les dossiers, télécharge l'image et démarre KROMA. Ouvrez
`http://NAS_IP:4040` et poursuivez avec [Premier démarrage](first-run.md).

KROMA s'exécute en tant que `root` dans le conteneur. Si vous laissez le module
Acquisition écrire dans vos partages, les fichiers qu'il crée appartiennent à
`root`. Si vos autres applications ou vos clients SMB ne peuvent alors plus les
modifier, lancez **Tools** > **Docker Safe New Perms**.

Pour mettre à jour, sélectionnez l'icône de KROMA dans l'onglet **Docker**, puis
**Check for Updates**, et appliquez la mise à jour.

## TrueNAS

TrueNAS Community Edition fait tourner les applications sur Docker depuis la
version 24.10 (Electric Eel). Ce guide ne couvre pas les versions antérieures.

### Préparer les datasets

TrueNAS ne laisse une application accéder qu'à un dataset dont les permissions
l'autorisent. KROMA s'exécute avec l'utilisateur **apps**, d'ID `568`.

1. Dans **Datasets**, créez un dataset pour les données de KROMA, par exemple
   `tank/apps/kroma`, avec le préréglage **Apps**. Ce préréglage donne déjà le
   contrôle total au groupe **apps**.
2. Sélectionnez le dataset qui contient vos médias, puis **Permissions** >
   **Edit**.
3. Sélectionnez **Add Item**, choisissez **Group** > **apps**, et donnez-lui
   **Read**, ou **Modify** pour le module Acquisition.
4. Sélectionnez **Save Access Control List**.

### Installer l'application

1. Ouvrez **Apps** > **Discover Apps**, sélectionnez le menu en haut à droite,
   puis **Install via YAML**.
2. Dans **Name**, saisissez `kroma`. Le nom doit être en minuscules.
3. Dans **Custom Config**, collez :

   ```yaml
   services:
     kroma:
       image: ghcr.io/kromatv/kroma:latest
       restart: unless-stopped
       user: "568:568"
       ports:
         - "4040:4040"
       volumes:
         - /mnt/tank/apps/kroma:/data
         - /mnt/tank/media:/media
   ```

   Remplacez `tank/apps/kroma` et `tank/media` par vos datasets. Gardez la
   partie après chaque deux-points.

4. Sélectionnez **Save**.

TrueNAS télécharge l'image et démarre KROMA. Ouvrez `http://NAS_IP:4040` et
poursuivez avec [Premier démarrage](first-run.md).

Pour mettre à jour, ouvrez l'application dans **Apps** et sélectionnez
**Update** quand TrueNAS indique qu'une mise à jour est disponible.

## Dépannage

Si KROMA ne démarre pas, ou si une bibliothèque reste vide, lisez le journal du
conteneur dans le gestionnaire d'applications de votre NAS, puis consultez
[Dépannage](troubleshooting.md). La cause la plus fréquente est un dossier que
l'utilisateur du conteneur ne peut pas lire, ou dans lequel il ne peut pas
écrire.
