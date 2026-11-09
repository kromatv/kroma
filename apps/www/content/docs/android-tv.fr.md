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
  Fire TV ou de nombreux vidéoprojecteurs. Vous installez vous-même chaque
  mise à jour.

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

Cette méthode nécessite
[adb](https://developer.android.com/tools/releases/platform-tools), l'outil
Android de Google, sur un ordinateur du même réseau.

1. Sur le téléviseur, ouvrez **Paramètres** > **Système** > **À propos**, puis
   sélectionnez **Build Android TV** sept fois, jusqu'à ce que le téléviseur
   indique que vous êtes développeur.
2. Revenez à **Paramètres** > **Système** > **Options pour les développeurs**
   et activez le débogage :
   - Sur Android 13 et versions ultérieures, ce qui inclut le Chromecast avec
     Google TV depuis sa mise à jour de 2025 et le Google TV Streamer, activez
     **Débogage sans fil**, puis sélectionnez
     **Associer l'appareil avec un code d'association**. Sur l'ordinateur,
     exécutez `adb pair` avec l'adresse et le code qu'affiche le téléviseur :

     ```bash
     adb pair 192.168.1.61:37199
     ```

     Connectez-vous ensuite avec l'adresse et le port affichés sur l'écran
     **Débogage sans fil**, un port différent du précédent :

     ```bash
     adb connect 192.168.1.61:42135
     ```

   - Sur les versions plus anciennes, activez **Débogage USB** ou
     **Network debugging**, selon la marque, puis connectez-vous sur le port
     `5555` :

     ```bash
     adb connect 192.168.1.61:5555
     ```

     Acceptez la demande sur le téléviseur, et cochez
     **Toujours autoriser sur cet ordinateur**.

3. Installez KROMA :

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

Depuis Google Play, les mises à jour s'installent d'elles-mêmes. Avec le
`.apk`, installez le nouveau fichier de la même façon. Le téléviseur conserve
l'adresse de votre serveur et reste connecté à votre compte.

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
le téléviseur, puis exécutez à nouveau la commande.

### `This app has been blocked`

Depuis 2025, Amazon bloque certaines applications installées hors boutique sur
Fire TV. Si un Fire TV bloque KROMA, utilisez plutôt la version Google Play sur
un appareil Google TV, et
[ouvrez un ticket](https://github.com/kromatv/kroma/issues) pour nous
prévenir.
