# Installer KROMA sur un ordinateur

KROMA a une application pour macOS, Windows et Linux, Steam Deck compris. Elle
affiche les mêmes écrans que l'application TV et se met à jour toute seule.
Vous pouvez aussi vous passer de l'application : chaque serveur KROMA sert une
version web à l'adresse `http://SERVER_IP:4040`.

Téléchargez le programme d'installation de votre système sur
[kroma.tv/download](https://kroma.tv/download). Les programmes d'installation
ne sont pas encore signés par Apple ni par Microsoft : chaque système vous
demande donc une confirmation la première fois.

## macOS

Il existe deux fichiers. Choisissez celui qui correspond au processeur de votre
Mac : dans le menu Pomme, sélectionnez **À propos de ce Mac**. Une ligne
**Puce** indique une puce Apple, une ligne **Processeur** indique un processeur
Intel.

| Votre Mac | Fichier |
| --- | --- |
| Puce Apple (M1 et modèles plus récents) | `KROMA_VERSION_aarch64.dmg` |
| Intel | `KROMA_VERSION_x64.dmg` |

1. Ouvrez le fichier `.dmg` et faites glisser **KROMA** dans **Applications**.
2. Ouvrez KROMA depuis **Applications**. La première fois, macOS refuse de
   l'ouvrir.
3. Ouvrez **Réglages Système** > **Confidentialité et sécurité**, faites
   défiler jusqu'au message qui concerne KROMA, puis sélectionnez **Ouvrir
   quand même**.
4. Confirmez avec **Ouvrir**, puis saisissez votre mot de passe si macOS le
   demande.

macOS retient ce choix. Les mises à jour s'installent sans nouvelle demande.

Si vous préférez le Terminal, cette commande fait les étapes 2 à 4 en une
fois :

```bash
xattr -dr com.apple.quarantine /Applications/KROMA.app
```

## Windows

Il existe deux fichiers. Utilisez `KROMA_VERSION_x64-setup.exe`, sauf si votre
service informatique installe les logiciels pour vous : dans ce cas, il lui
faut le `.msi`.

1. Ouvrez le programme d'installation.
2. Quand Windows affiche **Windows a protégé votre ordinateur**, sélectionnez
   **Informations complémentaires**, puis **Exécuter quand même**.
3. Suivez les étapes du programme d'installation.

Ensuite, KROMA se met à jour tout seul.

Si Windows refuse sans proposer de bouton **Exécuter quand même**, le
**Contrôle intelligent des applications** est activé. Il bloque toutes les
applications non signées, sans exception possible pour une seule application.
Utilisez plutôt la version web dans votre navigateur.

## Linux

- Sur Debian et Ubuntu, installez `KROMA_VERSION_amd64.deb`, par exemple avec
  `sudo apt install ./KROMA_*_amd64.deb`.
- Sur toute autre distribution, utilisez `KROMA_VERSION_amd64.AppImage`.
  Rendez-le exécutable, puis ouvrez-le :

  ```bash
  chmod +x KROMA_*.AppImage
  ./KROMA_*.AppImage
  ```

KROMA lit la vidéo avec mpv, qui est inclus dans l'application : vous n'avez
rien d'autre à installer.

## Steam Deck

1. Passez en **mode bureau**.
2. Téléchargez `KROMA_VERSION_amd64.AppImage`, puis rendez-le exécutable :
   faites un clic droit dessus, sélectionnez **Propriétés** > **Droits
   d'accès**, et cochez **est exécutable**.
3. Dans Steam, sélectionnez **Ajouter un jeu non Steam**, puis **Parcourir**,
   et choisissez l'AppImage.
4. Revenez au **Game Mode** et lancez KROMA depuis votre bibliothèque.
5. Dans les paramètres du contrôleur pour KROMA, choisissez la configuration
   **Manette**.

| Commande | Action |
| --- | --- |
| Croix directionnelle ou joystick gauche | Se déplacer |
| A | Sélectionner |
| B | Retour |
| X | Lecture ou pause |
| L1, L2 | Reculer dans la vidéo |
| R1, R2 | Avancer dans la vidéo |

## Se connecter à votre serveur

À l'ouverture, KROMA cherche un serveur sur votre réseau. S'il n'en trouve
aucun, saisissez l'adresse du serveur, par exemple `http://192.168.1.50:4040`,
puis connectez-vous avec votre compte.

## Navigateur web

Rien à installer : ouvrez `http://SERVER_IP:4040` dans Chrome, Edge, Firefox ou
Safari. Le serveur sert lui-même l'application web. Remplacez `SERVER_IP` par
l'adresse de votre serveur.
