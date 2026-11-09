# Installer KROMA sur un téléphone ou une tablette

KROMA pour iPhone, iPad et Android est en version bêta. Sur iPhone et iPad,
vous l'installez avec TestFlight, l'app d'Apple qui sert à tester des apps. Sur
Android, vous l'installez depuis Google Play en tant que testeur, ou à partir
du fichier `.apk`.

## iPhone et iPad

Il vous faut iOS ou iPadOS 16, ou une version plus récente.

1. Installez [TestFlight](https://apps.apple.com/app/testflight/id899247664)
   depuis l'App Store.
2. Ouvrez ce lien sur l'iPhone ou l'iPad :
   [testflight.apple.com/join/ZjgQdunW](https://testflight.apple.com/join/ZjgQdunW).
3. Touchez **Accepter**, puis **Installer**.

KROMA apparaît sur l'écran d'accueil. TestFlight vous prévient quand une
nouvelle version est prête. Une version bêta cesse de fonctionner 90 jours
après sa publication : gardez-la à jour.

La même bêta vous donne aussi KROMA sur votre Apple TV. Consultez
[Apple TV](apple-tv.md).

## Téléphone et tablette Android

### Depuis Google Play

KROMA est en test fermé : il n'apparaît donc pas dans une recherche.

1. Rejoignez le groupe de testeurs avec votre compte Google :
   [groups.google.com/g/kroma-android-beta](https://groups.google.com/g/kroma-android-beta).
2. Ouvrez la page du test et touchez **Devenir testeur** :
   [play.google.com/apps/testing/tv.kroma.app](https://play.google.com/apps/testing/tv.kroma.app).
3. Installez KROMA depuis Google Play :
   [play.google.com/store/apps/details?id=tv.kroma.app](https://play.google.com/store/apps/details?id=tv.kroma.app).

Google Play installe chaque nouvelle version. Après votre inscription au
groupe, la page du test peut mettre quelques heures à fonctionner.

### À partir du fichier `.apk`

1. Sur le téléphone, ouvrez la
   [page des versions](https://github.com/kromatv/kroma/releases/latest) et
   téléchargez le fichier dont le nom commence par `KROMA-mobile` et se termine
   par `.apk`.
2. Ouvrez le fichier téléchargé.
3. Si Android le demande, autorisez votre navigateur à installer des
   applications, puis revenez en arrière et touchez **Installer**.

Avec le `.apk`, vous installez vous-même chaque mise à jour. La version Google
Play et le `.apk` ne peuvent pas se remplacer l'un l'autre : désinstallez l'un
avant d'installer l'autre.

## Se connecter à votre serveur

1. Ouvrez KROMA. Sur votre réseau domestique, il trouve le serveur tout seul.
   Sinon, saisissez l'adresse du serveur, par exemple
   `http://192.168.1.50:4040`.
2. Connectez-vous avec votre compte, ou avec le lien d'invitation que le
   propriétaire vous a envoyé.

Hors de chez vous, l'application n'atteint le serveur que si celui-ci est
accessible depuis Internet. Consultez
[HTTPS, reverse proxy et accès distant](network.md).

## Étapes suivantes

- Connectez un téléviseur depuis votre téléphone :
  [Téléviseurs](tv.md#se-connecter-sur-le-téléviseur).
- [Dépannage](troubleshooting.md#un-téléviseur-ou-une-application-ne-trouve-pas-le-serveur).
