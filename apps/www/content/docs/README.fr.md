# Mettre en place KROMA

KROMA se compose de deux parties : un serveur qui contient vos films et vos
séries, et les applications qui les lisent. Vous installez le serveur une seule
fois, sur une machine qui reste allumée. Ensuite, vous installez une
application sur chaque écran où vous regardez.

La mise en place se fait en trois étapes :

1. [Installez le serveur](#installer-le-serveur) sur votre NAS ou sur un ordinateur.
2. [Créez votre compte et ajoutez vos médias](first-run.md) depuis un navigateur web.
3. [Installez les applications](#installer-les-applications) sur votre téléviseur, votre
   téléphone et votre ordinateur.

## Installer le serveur

Choisissez le guide qui correspond à la machine qui contient vos films :

| Votre machine | Guide |
| --- | --- |
| NAS Synology avec un processeur Intel ou AMD | [Synology](synology.md) |
| NAS Synology avec un processeur ARM | [Synology, avec Container Manager](synology.md#installer-avec-container-manager) |
| QNAP, Unraid ou TrueNAS | [Autres NAS](other-nas.md) |
| Ordinateur Linux, ou Raspberry Pi 4 ou 5 | [Docker](docker.md) |
| Ordinateur Mac ou Windows | [Docker](docker.md), avec Docker Desktop |

Le serveur fonctionne sur n'importe quel processeur x86 ou ARM 64 bits. Il a
besoin :

- d'un dossier pour ses propres données, qui grossit avec la taille de votre
  bibliothèque ;
- d'un accès en lecture à vos dossiers de médias, et d'un accès en écriture si
  KROMA doit télécharger ou renommer des fichiers pour vous (voir
  [Dossiers de médias et permissions](media-folders.md)) ;
- d'être joignable sur votre réseau domestique par votre téléviseur et votre
  téléphone, sur le port `4040`.

Quand l'écran peut lire un fichier, ce qui est le cas la plupart du temps, le
serveur l'envoie tel quel. Il lui faut donc peu de puissance de calcul. Quand un
écran ne peut pas lire un fichier, le serveur le convertit pendant que vous
regardez. Sur un NAS, c'est là que le
[transcodage matériel](hardware-transcoding.md) fait la différence.

## Installer les applications

KROMA n'est pas encore dans les boutiques d'applications. Sur les téléphones et
certains téléviseurs, il s'installe par un programme bêta. Les téléviseurs
Samsung et LG ont besoin d'un ordinateur une seule fois, pour y installer
l'application.

| Écran | Guide | Comment il s'installe aujourd'hui |
| --- | --- | --- |
| Téléviseur Samsung | [Téléviseur Samsung](samsung-tv.md) | depuis un ordinateur, après activation du mode développeur |
| Téléviseur LG | [Téléviseur LG](lg-tv.md) | depuis un ordinateur, avec l'application Developer Mode de LG |
| Android TV, Google TV, NVIDIA Shield | [Android TV](android-tv.md) | bêta Google Play, ou un fichier `.apk` |
| Amazon Fire TV, vidéoprojecteurs sans Google Play | [Android TV](android-tv.md#installer-sans-google-play) | un fichier `.apk` |
| Apple TV | [Apple TV](apple-tv.md) | TestFlight |
| iPhone, iPad, téléphone ou tablette Android | [Téléphones et tablettes](mobile.md) | TestFlight, ou la bêta Google Play |
| Mac, Windows, Linux, Steam Deck | [Ordinateurs](desktop.md) | un programme d'installation |
| N'importe quel navigateur web | rien à installer | ouvrez `http://SERVER_IP:4040` |

Au démarrage, chaque application cherche le serveur sur votre réseau. Si elle ne
le trouve pas, saisissez l'adresse du serveur, par exemple
`http://192.168.1.50:4040`. Pour vous connecter sur un téléviseur, approuvez-le
depuis votre téléphone ou saisissez le code à quatre chiffres qu'il affiche. La
page [Téléviseurs](tv.md) explique les deux méthodes.

## Tous les guides

Installer le serveur :

- [Docker](docker.md)
- [NAS Synology](synology.md)
- [QNAP, Unraid et TrueNAS](other-nas.md)
- [Dossiers de médias et permissions](media-folders.md)
- [Premier démarrage : votre compte et vos bibliothèques](first-run.md)

Installer les applications :

- [Téléviseurs : quelle application, et comment se connecter](tv.md)
- [Téléviseur Samsung](samsung-tv.md)
- [Téléviseur LG](lg-tv.md)
- [Android TV, Google TV et Fire TV](android-tv.md)
- [Apple TV](apple-tv.md)
- [Téléphones et tablettes](mobile.md)
- [Ordinateurs](desktop.md)

Faire tourner le serveur :

- [Transcodage matériel](hardware-transcoding.md)
- [HTTPS, reverse proxy et accès distant](network.md)
- [Mises à jour et sauvegardes](updates.md)
- [Référence de configuration](configuration.md)
- [Dépannage](troubleshooting.md)

Si aucun de ces guides ne répond à votre question, cherchez dans les
[issues](https://github.com/kromatv/kroma/issues) ou ouvrez-en une nouvelle.
