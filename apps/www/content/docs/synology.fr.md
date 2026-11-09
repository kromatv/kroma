# Installer KROMA sur un NAS Synology

Vous pouvez faire tourner KROMA de deux façons sur un NAS Synology. Les deux
servent le même KROMA sur le port `4040`.

| | Paquet KROMA | Container Manager |
| --- | --- | --- |
| Fonctionne sur | modèles Intel et AMD, DSM 7.0 ou version ultérieure | modèles Intel, AMD et certains modèles ARM, DSM 7.2 ou version ultérieure |
| Mises à jour | il les installe lui-même | vous récupérez la nouvelle image |
| Transcodage matériel sur les modèles Intel | configuré pour vous | vous l'ajoutez au fichier compose |
| Accès à vos dossiers | vous l'accordez à l'utilisateur `kroma` | vous l'accordez au conteneur |

Utilisez le paquet si votre NAS a un processeur Intel ou AMD. Utilisez Container
Manager sur un modèle ARM, ou si vous faites déjà tourner vos autres
applications dans Docker. Pour connaître votre processeur, ouvrez
**Panneau de configuration** > **Centre d'infos** > **Général** et lisez
**CPU**, ou cherchez votre modèle dans la
[liste des processeurs](https://kb.synology.com/en-global/DSM/tutorial/What_kind_of_CPU_does_my_NAS_have)
de Synology : `x86_64` correspond à Intel ou AMD, `armv8` à ARM.

## Avant de commencer

- Un compte administrateur sur le NAS.
- Vos films et vos séries dans un dossier partagé, comme `video`. Voir
  [Dossiers de médias et permissions](media-folders.md) pour savoir comment les
  nommer.
- Le chemin de chaque dossier de médias. Dans **File Station**, faites un clic
  droit sur le dossier, sélectionnez **Propriétés** et copiez **Emplacement**,
  par exemple `/volume1/video/Films`.

## Installer le paquet

### Ajouter la source de paquets KROMA

Une source de paquets permet au Centre de paquets d'installer KROMA et de
proposer ses mises à jour.

1. Dans DSM, ouvrez **Centre de paquets** > **Paramètres** > **Sources de paquets**.
2. Sélectionnez **Ajouter**.
3. Dans **Nom**, saisissez `KROMA`. Dans **Emplacement**, saisissez
   `https://packages.kroma.tv`.
4. Sélectionnez **OK**, puis fermez **Paramètres**.

### Installer KROMA

1. Dans le **Centre de paquets**, ouvrez l'onglet **Communauté**.
2. Sélectionnez **KROMA**, puis **Installer**.
3. DSM vous avertit que le paquet provient d'un développeur tiers et n'est pas
   vérifié par Synology. Confirmez pour continuer. Tous les paquets que Synology
   n'a pas publiés affichent cet avertissement.
4. Dans **Media library**, saisissez le chemin de vos films dans
   **Movies folder(s)** et celui de vos séries dans **TV Shows folder(s)**, par
   exemple `/volume1/video/Films`. Les deux champs sont préremplis avec un
   exemple : remplacez-le par votre dossier, ou videz le champ si vous n'avez
   aucun contenu de ce type. Séparez plusieurs dossiers par un deux-points. Vous
   pourrez tout modifier plus tard dans KROMA.
5. Dans **Server & storage**, gardez le port `4040`, sauf si une autre
   application l'utilise. Laissez **Data folder (optional)** vide, sauf si vous
   voulez placer la base de données et le cache d'images de KROMA sur un autre
   volume. Si vous le renseignez, créez d'abord ce dossier dans **File Station**
   et donnez à l'utilisateur `kroma` l'accès en **Lecture/écriture**, comme dans
   [Donner à KROMA l'accès à vos médias](#donner-à-kroma-laccès-à-vos-médias).
   KROMA ne peut pas démarrer sur un dossier de données où il ne peut pas écrire.
6. Terminez l'assistant.

DSM installe et démarre KROMA. KROMA ne voit pas encore vos médias : la section
suivante lui en donne l'accès.

### Donner à KROMA l'accès à vos médias

DSM 7 exécute chaque paquet tiers avec son propre utilisateur, qui n'a aucun
accès à vos dossiers partagés. L'utilisateur de KROMA s'appelle `kroma`.
Accordez-lui l'accès à chaque dossier partagé qui contient des médias :

1. Ouvrez **Panneau de configuration** > **Dossier partagé**.
2. Sélectionnez le dossier partagé, par exemple `video`, puis **Modifier**.
3. Ouvrez l'onglet **Autorisations**.
4. Dans la liste déroulante en haut à gauche, choisissez
   **Utilisateur du système interne**.
5. Trouvez `kroma` et cochez l'accès dont il a besoin :
   - **Lecture seule** pour regarder ce que vous avez.
   - **Lecture/écriture** si vous utilisez le module **Acquisition**, qui
     déplace les téléchargements dans vos bibliothèques et les renomme.
6. Sélectionnez **Enregistrer**.
7. Recommencez pour chaque dossier partagé qui contient des médias.
8. Dans le **Centre de paquets**, ouvrez **KROMA**, sélectionnez **Arrêter**,
   puis **Exécuter**.

KROMA redémarre et analyse vos dossiers. Pour donner accès à un seul
sous-dossier, passez plutôt par **File Station** : faites un clic droit sur le
dossier, sélectionnez **Propriétés** > **Autorisation** > **Créer**, et
choisissez l'utilisateur `kroma`.

### Ouvrir KROMA

Dans un navigateur, ouvrez `http://NAS_IP:4040`, où `NAS_IP` est l'adresse que
vous utilisez pour ouvrir DSM, par exemple `192.168.1.10`. Vous pouvez aussi
ouvrir KROMA depuis le menu principal de DSM.

Poursuivez avec [Premier démarrage](first-run.md).

### Installer le paquet manuellement

Sans la source de paquets, DSM ne peut pas proposer les mises à jour dans le
Centre de paquets, mais KROMA se met quand même à jour lui-même (voir
[Mises à jour](#mises-à-jour)).

1. Téléchargez `kroma-VERSION-x86_64.spk` depuis
   [kroma.tv/download](https://kroma.tv/download) ou depuis les
   [versions publiées](https://github.com/kromatv/kroma/releases).
2. Dans le **Centre de paquets**, sélectionnez **Installation manuelle**,
   choisissez le fichier et suivez le même assistant.

### Mises à jour

Le paquet vérifie toutes les six heures si une nouvelle version existe, et
l'installe de lui-même quand personne ne regarde. Pour choisir le moment de la
mise à jour, ouvrez KROMA, allez dans **Serveur** > **Mises à jour du serveur**
et désactivez l'installation automatique.

Le Centre de paquets peut continuer à afficher la version qu'il a installée au
départ. La page **Mises à jour du serveur** de KROMA affiche la version en
cours d'exécution.

### Transcodage matériel

Sur un modèle Intel, le paquet utilise la puce graphique du processeur pour
convertir les vidéos qu'un écran ne peut pas lire. Il n'y a rien à configurer.
Certains modèles n'ont aucune puce à utiliser :

- Les modèles à processeur AMD Ryzen, comme les DS723+, DS923+ et DS1522+,
  n'ont pas de puce graphique.
- Synology ne fournit plus le pilote graphique sur les modèles sortis en 2025
  ou après, comme les DS225+ et DS425+.

Sur ces modèles, KROMA convertit avec le processeur, ce qui est lent pour la 4K.
Lire le fichier d'origine sur un écran qui le prend en charge évite la
conversion. Voir [Transcodage matériel](hardware-transcoding.md).

### Où le paquet garde ses fichiers

| Quoi | Où |
| --- | --- |
| Base de données, cache d'images, modules installés | `/var/packages/kroma/var/data`, ou le dossier de données choisi dans l'assistant |
| Réglages de l'assistant | `/var/packages/kroma/var/kroma.conf` |
| Journal du serveur | `/var/packages/kroma/var/kroma.log` |

Vous pouvez aussi lire le journal dans KROMA, sous **Serveur** > **Journaux**.
Pour lire les fichiers eux-mêmes, activez SSH dans **Panneau de configuration** >
**Terminal & SNMP** et connectez-vous en tant qu'administrateur.

## Installer avec Container Manager

Container Manager est l'application Docker de Synology. Elle fonctionne sous
DSM 7.2 ou version ultérieure, sur les modèles Intel et AMD, et sur ces modèles
ARM : DS120j, DS124, DS220j, DS223, DS223j, DS420j et DS423. Installez-la
d'abord depuis le **Centre de paquets**.

1. Dans **File Station**, ouvrez le dossier partagé `docker`, que Container
   Manager a créé, et créez un dossier nommé `kroma`. Dans `kroma`, créez un
   dossier nommé `data`.
2. Ouvrez **Container Manager** > **Projet**, puis sélectionnez **Créer**.
3. Dans **Nom du projet**, saisissez `kroma`.
4. Dans **Chemin**, choisissez le dossier `docker/kroma`.
5. Dans **Source**, choisissez **Créer un fichier docker-compose.yml** et
   collez :

   ```yaml
   services:
     kroma:
       image: ghcr.io/kromatv/kroma:latest
       container_name: kroma
       restart: unless-stopped
       ports:
         - "4040:4040"
       volumes:
         - ./data:/data
         - /volume1/video:/media
   ```

   Remplacez `/volume1/video` par l'emplacement de votre dossier de médias.
   Gardez `:/media` à la fin.

6. Sélectionnez **Suivant** jusqu'au résumé, puis **Effectué**, et démarrez le
   projet.

Container Manager télécharge l'image et démarre KROMA. Ouvrez
`http://NAS_IP:4040` et poursuivez avec [Premier démarrage](first-run.md).
Quand vous ajoutez une bibliothèque, vos médias se trouvent sous `/media`.

### Donner au conteneur l'accès à vos médias

Le conteneur s'exécute en tant que `root`. Si une bibliothèque reste vide, ou si
le journal du serveur affiche `entries skipped` après une analyse, accordez
l'accès au dossier, comme Synology le conseille pour les conteneurs :

1. Dans **File Station**, faites un clic droit sur le dossier de médias et
   sélectionnez **Propriétés** > **Autorisation**.
2. Sélectionnez **Créer**, choisissez **Everyone** et cochez **Lecture** (ou
   **Lecture** et **Écriture** pour le module Acquisition).
3. Sélectionnez **Effectué**, puis **Enregistrer**.

**Everyone** désigne tous les comptes du NAS, pas tout le monde sur Internet.

> [!CAUTION]
> N'exécutez pas `chmod` sur un dossier partagé. Cette commande remplace les
> autorisations de DSM par des autorisations Unix de base, et Synology la
> documente comme une cause de problèmes d'accès inattendus.

### Mettre à jour le conteneur

Dans KROMA, **Serveur** > **Mises à jour du serveur** vous indique quand une
nouvelle version sort. Container Manager ne télécharge pas de lui-même une image
plus récente pour un projet en cours d'exécution. Faites donc la mise à jour en
SSH :

1. Activez SSH dans **Panneau de configuration** > **Terminal & SNMP** >
   **Terminal**.
2. Connectez-vous en tant qu'administrateur, par exemple avec
   `ssh admin@192.168.1.10`.
3. Téléchargez la nouvelle image et recréez le conteneur :

   ```bash
   cd /volume1/docker/kroma
   sudo docker compose pull
   sudo docker compose up -d
   ```

   Les versions de Container Manager antérieures à 24.0.2-1542 écrivent la
   commande `docker-compose`, avec un trait d'union.

Vos données restent dans `docker/kroma/data`.

### Transcodage matériel dans Container Manager

Sur un modèle Intel, ajoutez ces lignes sous `kroma:` dans le YAML du projet,
dans **Container Manager** > **Projet** > `kroma` > **Configurations YAML** :

```yaml
       devices:
         - /dev/dri:/dev/dri
       group_add:
         - "937"
```

`937` est l'ID habituel du groupe `videodriver` de DSM. Pour le vérifier sur
votre NAS, exécutez `getent group videodriver` en SSH.

## Dépannage

### Une bibliothèque reste vide

L'utilisateur `kroma`, ou le conteneur, ne peut pas lire le dossier. Vérifiez
les autorisations dans
[Donner à KROMA l'accès à vos médias](#donner-à-kroma-laccès-à-vos-médias),
redémarrez KROMA et lisez **Serveur** > **Journaux**. Voir aussi
[Dépannage](troubleshooting.md#une-bibliothèque-reste-vide-après-une-analyse).

### `kroma` n'apparaît pas dans la liste des utilisateurs

Par défaut, la liste affiche les utilisateurs locaux. Choisissez
**Utilisateur du système interne** dans la liste déroulante au-dessus.

### Le Centre de paquets indique que le paquet n'est pas valide

DSM n'installe un paquet que si sa version est supérieure à celle qui est
installée. Un build plus ancien que celui que vous avez échoue avec une erreur
sur le format du fichier. Téléchargez la dernière version.
