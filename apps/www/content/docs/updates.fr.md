# Mises à jour et sauvegardes

KROMA vérifie toutes les six heures si une nouvelle version du serveur existe.
Quand une version sort, l'administration affiche un avis, et **Serveur** >
**Mises à jour du serveur** liste les changements. La façon dont la mise à jour
s'installe dépend de la façon dont vous avez installé le serveur.

## Choisir un canal

**Mises à jour du serveur** suit l'un de ces deux canaux :

- **Stable** : les versions testées.
- **Canary** : un nouveau build à chaque modification, souvent plusieurs par
  jour. Plus récent, et moins testé.

Tant que vous n'avez pas choisi, KROMA suit le canal du build que vous avez
installé. Changez-le sur la page **Mises à jour du serveur**.

## Mettre à jour le serveur

### Paquet Synology

Le paquet installe les mises à jour de lui-même, quand personne ne regarde rien.
Pour choisir vous-même le moment, désactivez l'installation automatique sur la
page **Mises à jour du serveur**, puis sélectionnez la mise à jour sur cette même
page quand cela vous convient.

### Docker

Téléchargez la nouvelle image et recréez le conteneur, dans le dossier de votre
fichier compose :

```bash
docker compose pull
docker compose up -d
```

Vos données restent dans le dossier ou le volume de données. Pour que la page
**Mises à jour du serveur** installe les mises à jour à votre place, faites
tourner l'outil de mise à jour hôte de KROMA à côté de Docker. C'est un petit
script Python que vous installez une seule fois sur l'ordinateur. Sa
configuration est décrite dans
[server/updater](../../server/updater/README.md#docker-compose-linux-macos-windows-docker-hosts).

### Synology Container Manager, QNAP, Unraid et TrueNAS

Utilisez la méthode de votre NAS pour mettre à jour un conteneur. Chaque guide
la donne : [Synology](synology.md#mettre-à-jour-le-conteneur) et
[Autres NAS](other-nas.md).

## Mettre à jour les apps

| App | Comment elle se met à jour |
| --- | --- |
| iPhone, iPad, Apple TV | TestFlight installe les nouvelles versions |
| Android depuis Google Play | Google Play installe les nouvelles versions |
| Android depuis un fichier `.apk` | installez le nouveau fichier par-dessus l'ancien |
| Téléviseur Samsung | `npx @kromatv/installer update`, ou installez le nouveau `.tpk` (`.wgt` sur un téléviseur de 2017 à 2020), signé avec le même certificat qu'avant |
| Téléviseur LG | `npx @kromatv/installer update`, ou installez le nouveau `.ipk` |
| macOS, Windows, Linux | l'app se met à jour seule |

## Sauvegarder votre serveur

Vos films et séries ne sont jamais dans les données de KROMA : sauvegardez-les
comme vous le faites déjà. Les données de KROMA contiennent vos comptes, vos
réglages, votre historique de visionnage et vos points de reprise.

Pour créer une sauvegarde :

1. Ouvrez **Serveur** > **Sauvegarde**.
2. Sous **Exporter une sauvegarde**, sélectionnez **Exporter**.
3. Activez **Chiffrer avec un mot de passe**, puis saisissez un mot de passe
   dans **Mot de passe de chiffrement**.
4. Sélectionnez **Exporter**.

KROMA télécharge un fichier nommé `kroma-backup-DATE.kroma`. Conservez-le en
lieu sûr.

> [!WARNING]
> Sans mot de passe, la sauvegarde contient les empreintes des mots de passe et
> les clés d'API en clair. Définissez toujours un mot de passe, et conservez-le :
> il vous sera demandé pour restaurer.

La sauvegarde ne contient pas le catalogue des films et séries : un scan le
reconstruit sur la machine où vous restaurez.

## Restaurer ou changer de machine

1. Installez KROMA sur la nouvelle machine et créez un premier compte.
2. Ouvrez **Serveur** > **Sauvegarde**.
3. Sous **Importer une sauvegarde**, sélectionnez **Importer un fichier** et
   choisissez la sauvegarde.
4. Saisissez son mot de passe, puis sélectionnez **Restaurer**.

KROMA restaure les comptes, les réglages et l'historique, puis analyse vos
bibliothèques. Si vos dossiers de médias ont un autre chemin sur la nouvelle
machine, modifiez-les dans **Sources** et relancez un scan.
