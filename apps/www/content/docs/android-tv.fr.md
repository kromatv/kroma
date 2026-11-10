# Installer KROMA sur Android TV, Google TV et Fire TV

Ce guide couvre tous les téléviseurs et boîtiers sous Android : les téléviseurs
Google TV et Android TV de Sony, TCL, Philips et d'autres marques, le
Chromecast avec Google TV, le Google TV Streamer, la NVIDIA Shield, les Amazon
Fire TV sous Fire OS, et les vidéoprojecteurs sous Android.

Vous pouvez installer KROMA de deux façons :

- **Depuis Google Play**, en tant que testeur de la bêta. Les mises à jour
  s'installent d'elles-mêmes. Cette méthode nécessite Google Play sur le
  téléviseur.
- **Depuis le fichier `.apk`**, sur les appareils sans Google Play, comme un
  Fire TV ou de nombreux vidéoprojecteurs. L'application Downloader l'installe
  depuis le téléviseur, et l'installeur de KROMA depuis un ordinateur. Vous
  installez vous-même chaque mise à jour.

## Installer depuis Google Play

KROMA est en test fermé sur Google Play : il n'apparaît donc pas dans les
résultats de recherche. Rejoignez le test depuis un téléphone ou un ordinateur,
avec le compte Google qu'utilise le téléviseur.

1. Rejoignez le groupe de testeurs :
   [groups.google.com/g/kroma-android-beta](https://groups.google.com/g/kroma-android-beta).
2. Ouvrez la page du test et sélectionnez **Devenir testeur** :
   [play.google.com/apps/testing/tv.kroma.app](https://play.google.com/apps/testing/tv.kroma.app).
3. Ouvrez KROMA sur Google Play dans un navigateur :
   [play.google.com/store/apps/details?id=tv.kroma.app](https://play.google.com/store/apps/details?id=tv.kroma.app).
4. Sélectionnez **Installer**, choisissez votre téléviseur dans la liste des
   appareils, puis sélectionnez à nouveau **Installer**.

Le téléviseur télécharge KROMA dans les minutes qui suivent. L'application
apparaît avec vos autres applications. Selon Google, la page du test peut
mettre quelques heures à fonctionner après votre inscription au groupe.

## Installer sans Google Play

Le fichier s'appelle `KROMA-androidtv-VERSION.apk`. Il se trouve sur
[kroma.tv/download](https://kroma.tv/download) et sur la
[page des versions](https://github.com/kromatv/kroma/releases/latest).

### Avec l'application Downloader

Cette méthode ne nécessite que le téléviseur.

1. Sur le téléviseur, installez **Downloader** d'AFTVnews depuis la boutique
   d'applications.
2. Autorisez Downloader à installer des applications :
   - Sur Google TV et Android TV : **Paramètres** > **Applications** >
     **Sécurité et restrictions** > **Sources inconnues**, puis activez
     **Downloader**.
   - Sur Fire TV : **Paramètres** > **Ma Fire TV** >
     **Options pour les développeurs** > **Install unknown apps**, puis
     activez **Downloader**.
3. Ouvrez Downloader et saisissez cette adresse :

   ```
   https://github.com/kromatv/kroma/releases/latest
   ```

4. Faites défiler jusqu'à la liste des fichiers et sélectionnez celui qui
   commence par `KROMA-androidtv`.
5. À la fin du téléchargement, sélectionnez **Installer**.

KROMA apparaît dans la liste complète des applications. Certains écrans
d'accueil n'ajoutent pas d'eux-mêmes à leur rangée principale les applications
installées hors boutique.

### Depuis un ordinateur

L'installeur de KROMA trouve le téléviseur sur votre réseau et y installe
KROMA. Il fonctionne quand le téléviseur propose **Network debugging** ou
**Débogage USB**. Un téléviseur qui ne propose que le **Débogage sans fil**
avec un code d'association demande plutôt
[Depuis un ordinateur, avec un code d'association](#depuis-un-ordinateur-avec-un-code-dassociation).

Il vous faut un ordinateur Mac ou Linux sur le même réseau que le téléviseur,
avec [Node.js](https://nodejs.org) 22 ou plus récent. `node --version` affiche
la version. L'installeur ne fonctionne pas sur Windows.

1. Sur le téléviseur, ouvrez **Paramètres** > **Système** > **À propos**, puis
   sélectionnez **Build Android TV** sept fois, jusqu'à ce que le téléviseur
   indique que vous êtes développeur.
2. Revenez à **Paramètres** > **Système** > **Options pour les développeurs**
   et activez **Network debugging** ou **Débogage USB**, selon la marque.
3. Dans un terminal, sur votre ordinateur, lancez l'installeur :

   ```bash
   npx @kromatv/installer
   ```

   La première fois, `npx` demande s'il peut télécharger l'installeur. Tapez
   `y`, puis Entrée. L'installeur pose ses questions en anglais. Déplacez-vous
   avec les flèches et répondez avec Entrée.

4. À la question **Which version of KROMA?**, choisissez **Stable**.
5. À la question **Which kind of TV?**, choisissez **Android TV**.
6. À la question **Which TVs get KROMA?**, attendez que votre téléviseur
   apparaisse.

   Un téléviseur dont le débogage est activé affiche **ready** et il est déjà
   coché. La barre d'espace coche ou décoche un téléviseur.

7. Appuyez sur Entrée pour installer.

   L'installeur dialogue lui-même avec le téléviseur. Rien d'autre n'est
   installé sur votre ordinateur.

8. Sur le téléviseur, acceptez la demande d'autorisation de cet ordinateur, et
   cochez **Toujours autoriser sur cet ordinateur**.

   L'installeur télécharge la dernière version de KROMA pour Android TV,
   l'installe sur le téléviseur et la démarre.

Si le téléviseur n'apparaît pas dans la liste, installez KROMA en donnant son
adresse :

```bash
npx @kromatv/installer install 192.168.1.61
```

Remplacez `192.168.1.61` par l'adresse de votre téléviseur.

### Depuis un ordinateur, avec un code d'association

Android 13 et les versions ultérieures, ce qui inclut le Chromecast avec
Google TV depuis sa mise à jour de 2025 et le Google TV Streamer, peuvent ne
proposer que le **Débogage sans fil**, avec un code d'association.
L'installeur de KROMA ne le prend pas encore en charge. Utilisez
[adb](https://developer.android.com/tools/releases/platform-tools), l'outil
Android de Google, sur un ordinateur du même réseau.

1. Sur le téléviseur, ouvrez **Paramètres** > **Système** > **À propos**, puis
   sélectionnez **Build Android TV** sept fois, jusqu'à ce que le téléviseur
   indique que vous êtes développeur.
2. Revenez à **Paramètres** > **Système** > **Options pour les développeurs**,
   activez **Débogage sans fil**, puis sélectionnez
   **Associer l'appareil avec un code d'association**.
3. Sur l'ordinateur, associez-le avec l'adresse et le code qu'affiche le
   téléviseur :

   ```bash
   adb pair 192.168.1.61:37199
   ```

4. Connectez-vous avec l'adresse et le port affichés sur l'écran
   **Débogage sans fil**, un port différent du précédent :

   ```bash
   adb connect 192.168.1.61:42135
   ```

5. Installez KROMA :

   ```bash
   adb install -r KROMA-androidtv-*.apk
   ```

Remplacez les adresses et les ports par ceux qu'affiche votre téléviseur.

## Amazon Fire TV

Les clés Fire TV Stick et les téléviseurs Fire TV sous **Fire OS** installent
KROMA avec l'application Downloader, comme ci-dessus. Downloader se trouve dans
l'Amazon Appstore.

Le Fire TV Stick 4K Select (2025), le Fire TV Stick HD (2026) et le Fire TV
Stick 4K de 3e génération (2026) fonctionnent sous **Vega OS** et ne peuvent
installer aucune application Android. Dans **Paramètres** > **Ma Fire TV** >
**À propos**, un appareil sous Fire OS affiche **Fire OS**.

Si **Options pour les développeurs** n'apparaît pas sur un Fire TV, ouvrez
**Paramètres** > **Ma Fire TV** > **À propos** et sélectionnez sept fois le
nom de l'appareil.

## Mettre à jour KROMA

Depuis Google Play, les mises à jour s'installent d'elles-mêmes. Si vous avez
installé KROMA avec son installeur, mettez-le à jour sur tous les téléviseurs
où cet ordinateur l'a installé :

```bash
npx @kromatv/installer update
```

Sinon, installez le nouveau `.apk` de la même façon que la première fois. Le
téléviseur conserve l'adresse de votre serveur et reste connecté à votre compte.

## Dépannage

### `App not installed`, ou `INSTALL_FAILED_UPDATE_INCOMPATIBLE`

Un KROMA signé avec une autre clé est déjà installé, par exemple la version
Google Play quand vous installez le `.apk`, ou l'inverse. Désinstallez-le,
puis installez à nouveau. Avec adb :

```bash
adb uninstall tv.kroma.app
```

### Deux applications KROMA sur le téléviseur

Avant la version 0.2, l'application Android TV avait un autre identifiant,
`tv.kroma.tv` ou `tv.kroma.androidtv`. La nouvelle application s'installe à
côté de l'ancienne. Connectez la nouvelle à votre serveur, puis désinstallez
l'ancienne.

### adb affiche le téléviseur comme `unauthorized`

Le téléviseur attend que vous acceptiez l'ordinateur. Acceptez la demande sur
le téléviseur, cochez **Toujours autoriser sur cet ordinateur**, puis relancez
la commande ou l'installeur.

### `This app has been blocked`

Depuis 2025, Amazon bloque certaines applications installées hors boutique sur
Fire TV. Si un Fire TV bloque KROMA, utilisez plutôt la version Google Play sur
un appareil Google TV, et
[ouvrez un ticket](https://github.com/kromatv/kroma/issues) pour nous
prévenir.
