# Installer KROMA sur un téléviseur LG

Un téléviseur LG installe une application hors de sa boutique grâce à
l'application **Developer Mode** de LG, quand elle est envoyée depuis un
ordinateur du même réseau. Ce guide active le mode développeur et installe
KROMA, en 15 minutes environ.

Un seul fichier KROMA fonctionne sur tous les téléviseurs LG sous webOS 4.0 ou
plus récent, c'est-à-dire les modèles de 2018 et après. Les modèles de 2016 et
2017 ne peuvent pas le faire fonctionner.

## Avant de commencer

- Un téléviseur LG de 2018 ou plus récent.
- Un ordinateur Mac, Windows ou Linux sur le même réseau que le téléviseur.
- Un compte développeur LG gratuit. Créez-le sur
  [webostv.developer.lge.com](https://webostv.developer.lge.com) avec
  **Sign In** > **Create Account**.
- Le fichier KROMA pour LG, `tv.kroma.webos_VERSION_all.ipk`, sur
  [kroma.tv/download](https://kroma.tv/download) ou sur la
  [page des versions](https://github.com/kromatv/kroma/releases).

## Activer le mode développeur sur le téléviseur

1. Sur le téléviseur, ouvrez la boutique d'applications, appelée
   **Applications** ou **LG Content Store** selon l'année. Cherchez
   l'application **Developer Mode** et installez-la.
2. Ouvrez **Developer Mode** et connectez-vous avec votre compte développeur
   LG.
3. Réglez **Dev Mode Status** sur **On**. Le téléviseur redémarre.
4. Ouvrez à nouveau **Developer Mode** et réglez **Key Server** sur **On**.

L'application affiche maintenant l'adresse IP du téléviseur et une phrase
secrète de six caractères. Laissez-la ouverte : vous avez besoin des deux à
l'étape suivante.

## Installer KROMA

Choisissez l'une des deux méthodes ci-dessous. La première ne demande aucune
ligne de commande.

### Avec webOS Dev Manager

[webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop) est une
application de bureau gratuite pour Windows, macOS et Linux, développée par la
communauté webOS Homebrew. Ce n'est pas un produit LG.

1. Téléchargez-la depuis sa
   [page des versions](https://github.com/webosbrew/dev-manager-desktop/releases)
   et ouvrez-la.
2. Ajoutez votre téléviseur avec l'adresse IP et la phrase secrète
   qu'affiche **Developer Mode**.
3. Ouvrez l'onglet **Apps**, choisissez d'installer un paquet, puis
   sélectionnez le fichier `.ipk` que vous avez téléchargé.

### Avec les outils en ligne de commande de LG

1. Installez la CLI webOS. Elle nécessite [Node.js](https://nodejs.org) 20 ou
   plus récent :

   ```bash
   npm install -g @webos-tools/cli
   ```

2. Enregistrez le téléviseur :

   ```bash
   ares-setup-device --add tv -i "host=192.168.1.60" -i "port=9922" -i "username=prisoner"
   ```

   Remplacez `192.168.1.60` par l'adresse IP qu'affiche **Developer Mode**.

3. Récupérez la clé du téléviseur. Saisissez la phrase secrète quand elle vous
   est demandée :

   ```bash
   ares-novacom --device tv --getkey
   ```

4. Installez et lancez KROMA :

   ```bash
   ares-install --device tv tv.kroma.webos_*_all.ipk
   ares-launch --device tv tv.kroma.webos
   ```

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

Installez le nouveau `.ipk` de la même façon. Le téléviseur conserve l'adresse
de votre serveur et reste connecté à votre compte.

## Dépannage

### L'ordinateur ne parvient pas à joindre le téléviseur

Vérifiez que **Key Server** est activé dans l'application **Developer Mode**,
et que l'adresse saisie est celle que l'application affiche maintenant. Un
téléviseur qui a redémarré peut avoir une nouvelle adresse.

### `ares-novacom` demande une phrase secrète puis la refuse

La phrase secrète distingue les majuscules des minuscules, et elle change
quand vous désactivez puis réactivez le mode développeur. Copiez-la à nouveau
depuis l'application **Developer Mode**.

### KROMA a disparu du téléviseur

La session du mode développeur a expiré. Réactivez le mode développeur, puis
installez KROMA à nouveau.
