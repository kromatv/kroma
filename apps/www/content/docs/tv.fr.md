# Installer KROMA sur un téléviseur

KROMA n'est pas encore dans les boutiques d'applications des téléviseurs. La
méthode d'installation dépend donc de votre téléviseur. Cette page vous indique
le guide à suivre, puis explique comment le téléviseur trouve votre serveur et
se connecte à votre compte une fois l'application installée.

## Trouver votre téléviseur

| Votre téléviseur ou boîtier | Guide | Ce qu'il vous faut |
| --- | --- | --- |
| Samsung, 2017 ou plus récent | [Téléviseur Samsung](samsung-tv.md) | un ordinateur, un compte Samsung gratuit, environ 30 minutes la première fois |
| LG, webOS 4.0 (2018) ou plus récent | [Téléviseur LG](lg-tv.md) | un ordinateur, un compte développeur LG gratuit |
| Android TV, Google TV, NVIDIA Shield, Philips, Sony, TCL | [Android TV](android-tv.md) | un compte Google, ou le fichier `.apk` |
| Amazon Fire TV avec Fire OS | [Android TV : Fire TV](android-tv.md#amazon-fire-tv) | l'application Downloader |
| Apple TV | [Apple TV](apple-tv.md) | un iPhone ou un iPad, et TestFlight |

Certains téléviseurs ne peuvent pas faire fonctionner KROMA : les LG de 2016 et
2017 (webOS 3), les Philips sous Saphi ou Titan OS, et les Fire TV Stick les
plus récents, qui fonctionnent sous Vega OS et non sous Fire OS. Sur ces
appareils, utilisez un boîtier de streaming, par exemple un Google TV, une
Apple TV ou un Fire TV sous Fire OS, ou ouvrez KROMA dans le navigateur web du
téléviseur.

## Connecter le téléviseur à votre serveur

Au premier démarrage de KROMA sur un téléviseur, l'application cherche votre
serveur :

1. Elle recherche un serveur KROMA sur le port `4040` de votre réseau
   domestique. Si elle en trouve un, elle s'y connecte sans rien demander.
2. Si elle n'en trouve aucun, elle affiche **Ajouter un serveur**. Saisissez
   l'adresse du serveur avec la télécommande, par exemple `192.168.1.50:4040`,
   puis sélectionnez **Connecter**.

La recherche échoue quand le téléviseur et le serveur sont sur des réseaux
différents, comme un Wi-Fi invité, ou quand le serveur utilise un autre port
que `4040`. Dans ces deux cas, saisissez l'adresse.

## Se connecter sur le téléviseur

Saisir un mot de passe avec une télécommande prend du temps. Le téléviseur
demande donc à un autre appareil de le connecter à votre compte. Il propose
deux méthodes :

- **Depuis votre téléphone, sur le même réseau.** Ouvrez KROMA sur votre
  téléphone, connecté à votre compte. L'application liste les téléviseurs en
  attente à proximité. Touchez le vôtre et approuvez.
- **Avec un code, depuis n'importe où.** Le téléviseur affiche un code à quatre
  chiffres et un QR code. Sur un téléphone ou un ordinateur connecté à KROMA,
  sélectionnez **Connecter un appareil** dans le menu, saisissez le code, puis
  sélectionnez **Autoriser**. Cette méthode fonctionne d'un réseau à l'autre,
  même depuis un téléphone en données mobiles. Si vous scannez le QR code avec
  l'appareil photo d'un téléphone, la même page s'ouvre dans son navigateur, à
  condition que le téléphone puisse joindre l'adresse du serveur.

Le téléviseur affiche ensuite les profils de votre compte. Un profil protégé
par un code PIN vous le demande.

> [!TIP]
> Pour connecter un téléviseur au compte d'une autre personne, cette personne
> l'approuve depuis son propre téléphone, ou saisit le code en étant connectée
> à son propre compte.

## Étapes suivantes

- [Dépannage](troubleshooting.md#un-téléviseur-ou-une-application-ne-trouve-pas-le-serveur)
  si un téléviseur ne trouve pas le serveur ou ne parvient pas à le joindre.
- [Transcodage matériel](hardware-transcoding.md) si un film se lit sur votre
  téléphone mais pas sur votre téléviseur.
