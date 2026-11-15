# Installer KROMA sur un téléviseur LG

Un téléviseur LG installe une application hors de sa boutique grâce à
l'application **Developer Mode** de LG, quand elle est envoyée depuis un
ordinateur du même réseau. Ce guide active le mode développeur, puis installe
KROMA avec son propre installeur, en 15 minutes environ.

Un seul fichier KROMA, `KROMA-webos-VERSION.ipk`, fonctionne sur tous les
téléviseurs LG sous webOS 4.0 ou plus récent, c'est-à-dire les modèles de 2018
et après. Les modèles de 2016 et 2017 ne peuvent pas le faire fonctionner.
C'est l'app native : elle tourne directement sur le téléviseur, sans
navigateur.

## Avant de commencer

- Un téléviseur LG de 2018 ou plus récent.
- Un ordinateur Mac ou Linux sur le même réseau que le téléviseur, avec
  [Node.js](https://nodejs.org) 22 ou plus récent. `node --version` affiche la
  version. Sur Windows, suivez plutôt
  [Facultatif : installer avec webOS Dev Manager](#facultatif--installer-avec-webos-dev-manager).
- Un compte développeur LG gratuit. Créez-le sur
  [webostv.developer.lge.com](https://webostv.developer.lge.com) avec
  **Sign In** > **Create Account**.

## Activer le mode développeur sur le téléviseur

1. Sur le téléviseur, ouvrez la boutique d'applications, appelée
   **Applications** ou **LG Content Store** selon l'année. Cherchez
   l'application **Developer Mode** et installez-la.
2. Ouvrez **Developer Mode** et connectez-vous avec votre compte développeur
   LG.
3. Réglez **Dev Mode Status** sur **On**. Le téléviseur redémarre.
4. Ouvrez à nouveau **Developer Mode** et réglez **Key Server** sur **On**.

L'application affiche maintenant l'adresse IP du téléviseur et une phrase
secrète de six caractères. Laissez-la ouverte : l'installeur vous demande la
phrase secrète.

## Installer KROMA

L'installeur pose ses questions en anglais. Déplacez-vous avec les flèches et
répondez avec Entrée.

1. Dans un terminal, sur votre ordinateur, lancez l'installeur :

   ```bash
   npx @kromatv/installer
   ```

   La première fois, `npx` demande s'il peut télécharger l'installeur. Tapez
   `y`, puis Entrée. L'installeur affiche le nom KROMA et une courte aide.
   Pour l'arrêter à tout moment, appuyez sur Ctrl+C.

2. À la question **Which version of KROMA?**, choisissez **Stable**.
3. À la question **Which kind of TV?**, choisissez **LG**.

   L'installeur rappelle les réglages à faire sur le téléviseur. Vous les avez
   déjà faits dans
   [Activer le mode développeur sur le téléviseur](#activer-le-mode-développeur-sur-le-téléviseur).

4. À la question **Which TVs get KROMA?**, attendez que votre téléviseur
   apparaisse.

   L'installeur cherche les téléviseurs LG de votre réseau. Un téléviseur dont
   le mode développeur est activé affiche **ready** et il est déjà coché. La
   barre d'espace coche ou décoche un téléviseur.

5. Appuyez sur Entrée pour installer.
6. Quand l'installeur demande la phrase secrète, saisissez celle qu'affiche
   l'application **Developer Mode** sur le téléviseur, puis appuyez sur
   Entrée.

   L'installeur obtient la clé du téléviseur avec la phrase secrète, et la
   conserve dans le dossier `.kroma/keys/webos` de votre dossier personnel :
   les installations et mises à jour suivantes ne la redemandent pas. Il
   télécharge ensuite la dernière version de KROMA pour LG, l'installe sur le
   téléviseur et la démarre. Rien d'autre n'est installé sur votre ordinateur.

KROMA s'ouvre sur le téléviseur et apparaît dans sa liste d'applications.
Suivez
[Connecter le téléviseur à votre serveur](tv.md#connecter-le-téléviseur-à-votre-serveur).

## Garder le mode développeur actif

Le mode développeur reste actif pendant une durée limitée. L'application
**Developer Mode** indique le temps restant : jusqu'à 1000 heures sur les
micrologiciels actuels, 50 heures sur les téléviseurs plus anciens.

> [!WARNING]
> Quand le temps est écoulé, le téléviseur désactive le mode développeur et
> supprime KROMA. Ouvrez **Developer Mode** et sélectionnez **Extend** avant
> que cela n'arrive. Une fois le temps écoulé, vous devez réactiver le mode
> développeur et installer KROMA à nouveau.

webOS Dev Manager peut prolonger la session à votre place, de façon
planifiée.

## Mettre à jour KROMA

Mettez à jour KROMA sur tous les téléviseurs où cet ordinateur l'a installé :

```bash
npx @kromatv/installer update
```

L'installeur ne demande rien. Le téléviseur conserve l'adresse de votre
serveur et reste connecté à votre compte.

### Passer de l'app web à l'app native

Avant l'app native, les téléviseurs LG recevaient l'app web. La prochaine
installation ou mise à jour ajoute l'app native à côté. Ce sont deux apps
distinctes : le téléviseur affiche alors KROMA deux fois, et l'app native
demande une fois votre serveur et votre connexion.

Quand l'app native fonctionne, supprimez l'app web de la liste d'applications
du téléviseur.

L'app web figure toujours dans chaque version, sous le nom
`tv.kroma.webos_VERSION_all.ipk`. Pour l'installer à la place de l'app native,
installez avec l'adresse du téléviseur et `--web` :

```bash
npx @kromatv/installer install 192.168.1.60 --web
```

Remplacez `192.168.1.60` par l'adresse IP qu'affiche **Developer Mode**.
L'installeur retient l'app web pour ce téléviseur, et `update` la conserve.
Utilisez `--no-web` de la même façon pour revenir à l'app native.

## Facultatif : installer avec webOS Dev Manager

[webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop) est une
application de bureau gratuite pour Windows, macOS et Linux, développée par la
communauté webOS Homebrew. Ce n'est pas un produit LG. Utilisez-la sur
Windows, où l'installeur de KROMA ne fonctionne pas. Elle remplace
[Installer KROMA](#installer-kroma) et
[Mettre à jour KROMA](#mettre-à-jour-kroma) ci-dessus.

Il vous faut aussi le fichier KROMA pour LG, `KROMA-webos-VERSION.ipk`, sur
[kroma.tv/download](https://kroma.tv/download) ou sur la
[page des versions](https://github.com/kromatv/kroma/releases).

1. Téléchargez webOS Dev Manager depuis sa
   [page des versions](https://github.com/webosbrew/dev-manager-desktop/releases)
   et ouvrez-le.
2. Ajoutez votre téléviseur avec l'adresse IP et la phrase secrète
   qu'affiche **Developer Mode**.
3. Ouvrez l'onglet **Apps**, choisissez d'installer un paquet, puis
   sélectionnez le fichier `.ipk` que vous avez téléchargé.

KROMA apparaît dans la liste d'applications du téléviseur. Suivez
[Connecter le téléviseur à votre serveur](tv.md#connecter-le-téléviseur-à-votre-serveur).

Pour mettre à jour KROMA, installez le nouveau `.ipk` de la même façon. Le
téléviseur conserve l'adresse de votre serveur et reste connecté à votre
compte.

## Dépannage

### Le téléviseur n'apparaît pas dans l'installeur

Vérifiez que **Dev Mode Status** et **Key Server** sont activés dans
l'application **Developer Mode**, et que le téléviseur et l'ordinateur sont
sur le même réseau. Si le téléviseur n'apparaît toujours pas, installez KROMA
en donnant son adresse :

```bash
npx @kromatv/installer install 192.168.1.60 --passphrase A1B2C3
```

Remplacez `192.168.1.60` par l'adresse IP qu'affiche **Developer Mode**, et
`A1B2C3` par sa phrase secrète. Un téléviseur qui a redémarré peut avoir une
nouvelle adresse.

### Le téléviseur refuse la phrase secrète

La phrase secrète distingue les majuscules des minuscules, et elle change
quand vous désactivez puis réactivez le mode développeur. Copiez-la à nouveau
depuis l'application **Developer Mode**.

### KROMA a disparu du téléviseur

La session du mode développeur a expiré. Réactivez le mode développeur, puis
installez KROMA à nouveau.
