# Installer KROMA sur un téléviseur Samsung

Un téléviseur Samsung n'installe une application hors de sa boutique qu'en mode
développeur, quand elle est envoyée depuis un ordinateur du même réseau et
signée avec un certificat que Samsung délivre pour ce seul téléviseur. Ce guide
met en place ces trois conditions. Le premier téléviseur prend environ 30
minutes. Le suivant, cinq.

## Avant de commencer

- Un téléviseur Samsung connecté de 2017 ou plus récent.
- Un ordinateur Mac, Windows ou Linux sur le même réseau que le téléviseur.
- Un compte Samsung, du même type que celui que vous utilisez sur le
  téléviseur. Il est gratuit.
- L'adresse de votre ordinateur sur le réseau, par exemple `192.168.1.20`. Sur
  un Mac, elle se trouve dans **Réglages Système** > **Wi-Fi** > **Détails**.
  Sur Windows, exécutez `ipconfig`. Sur Linux, exécutez `hostname -I`.
- L'adresse de votre téléviseur, dans **Paramètres** > **Général** >
  **Réseau** > **État du réseau** > **Paramètres IP** sur le téléviseur.
- Le fichier KROMA pour Samsung, `KROMA-tizen-VERSION.wgt`, sur
  [kroma.tv/download](https://kroma.tv/download) ou sur la
  [page des versions](https://github.com/kromatv/kroma/releases).

## Activer le mode développeur sur le téléviseur

1. Sur le téléviseur, ouvrez **Applications**.

   Sur les téléviseurs de 2024 et plus récents, **Applications** est un onglet
   de la barre en haut de l'écran d'accueil.

2. Saisissez `1 2 3 4 5` avec la télécommande.

   Si votre télécommande n'a pas de touches numériques, appuyez sur la touche
   **123** pour afficher un pavé numérique à l'écran. Sur les téléviseurs de
   2024 et plus récents, faites d'abord défiler jusqu'aux paramètres en bas de
   **Applications**, puis saisissez le code.

3. Dans la fenêtre **Mode développeur**, activez **Mode développeur**.
4. Saisissez l'adresse de votre ordinateur comme adresse IP du PC hôte, puis
   sélectionnez **OK**.
5. Éteignez le téléviseur, puis rallumez-le.

Au redémarrage, **Mode développeur** s'affiche en haut de l'écran
**Applications**. Sinon, débranchez le téléviseur pendant 30 secondes, puis
rebranchez-le : quand **Instant On** est activé, la télécommande ne fait que
mettre le téléviseur en veille.

## Installer les outils de Samsung sur votre ordinateur

Les outils en ligne de commande de Samsung, `tizen` et `sdb`, sont fournis avec
Tizen Studio.

1. Téléchargez Tizen Studio depuis la page
   [Installing TV SDK](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html)
   de Samsung, puis installez-le.
2. Dans le **Package Manager** qui s'ouvre à la fin, allez dans
   **Extension SDK** et installez **TV Extensions** et
   **Samsung Certificate Extension**.

   Depuis septembre 2025, Samsung exige Samsung Certificate Extension 2.0.74 ou
   plus récent. Les versions antérieures ne peuvent pas créer de certificats.

## Connecter l'ordinateur au téléviseur

1. Dans Tizen Studio, ouvrez **Tools** > **Device Manager**.
2. Sélectionnez **Remote Device Manager**, puis **+**.
3. Saisissez un nom et l'adresse du téléviseur, gardez le port `26101`, puis
   sélectionnez **Add**.
4. Activez l'interrupteur à côté du téléviseur.

Le téléviseur apparaît dans la liste des appareils, avec un nom comme
`UE55AU7172`.

## Créer un certificat pour votre téléviseur

Les téléviseurs Samsung n'installent que des applications signées avec un
certificat créé pour ce téléviseur. Vous le créez une fois, puis vous le
réutilisez pour chaque mise à jour.

1. Dans Tizen Studio, ouvrez **Tools** > **Certificate Manager**.
2. Sélectionnez **+**, puis **Samsung**, puis **TV**.
3. Saisissez un nom de profil, par exemple `kroma`.
4. Choisissez **Create a new author certificate**, saisissez un nom et un mot
   de passe, puis connectez-vous avec votre compte Samsung quand le navigateur
   s'ouvre.
5. Pour le certificat de distributeur, gardez le niveau de privilège par
   défaut. Vérifiez que la liste des appareils contient votre téléviseur :
   Tizen Studio lit son identifiant, appelé DUID, sur le téléviseur connecté.
   Le téléviseur l'affiche aussi dans **Paramètres** > **Assistance** >
   **Contacter Samsung**, sous **Unique Device ID**.
6. Sélectionnez **Finish**.

Conservez le certificat d'auteur et son mot de passe. Une mise à jour de KROMA
doit être signée avec le même certificat d'auteur, sinon le téléviseur la
refuse. Pour ajouter un deuxième téléviseur plus tard, modifiez le profil et
ajoutez ce téléviseur au certificat de distributeur.

La procédure officielle, avec des captures d'écran, se trouve sur la page
[Creating certificates](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html)
de Samsung.

## Installer KROMA

Le fichier `.wgt` que vous avez téléchargé est signé par KROMA. Signez-le à
nouveau avec votre propre certificat, puis envoyez-le au téléviseur.

Sur macOS ou Linux, dans un terminal, dans le dossier où vous avez téléchargé
le fichier :

1. Décompressez le fichier et supprimez ses signatures :

   ```bash
   mkdir kroma-tizen
   unzip -q KROMA-tizen-*.wgt -d kroma-tizen
   cd kroma-tizen
   rm -f author-signature.xml signature1.xml signature2.xml
   ```

2. Signez-le avec votre profil :

   ```bash
   ~/tizen-studio/tools/ide/bin/tizen package -t wgt -s kroma -- .
   ```

   Remplacez `kroma` par le nom de profil que vous avez choisi. La commande
   crée `KROMA.wgt` dans le dossier.

3. Installez-le sur le téléviseur :

   ```bash
   ~/tizen-studio/tools/ide/bin/tizen install -n KROMA.wgt -- .
   ```

Sur Windows, renommez le fichier en `.zip`, extrayez-le dans un dossier,
supprimez `author-signature.xml`, `signature1.xml` et `signature2.xml`, puis
exécutez les deux mêmes commandes `tizen` dans l'**Invite de commandes**,
depuis ce dossier, avec `C:\tizen-studio\tools\ide\bin\tizen.bat`.

KROMA apparaît dans **Applications** sur le téléviseur. Ouvrez-le, puis suivez
[Connecter le téléviseur à votre serveur](tv.md#connecter-le-téléviseur-à-votre-serveur).

## Facultatif : installer avec l'installeur TV de KROMA

Si vous avez une copie du dépôt KROMA et [Bun](https://bun.sh) sur un
ordinateur Mac ou Linux, une seule commande trouve les téléviseurs de votre
réseau, signe l'application avec votre profil Tizen Studio actif et l'installe :

```bash
bun install
bun run tv
```

Vous devez quand même activer le mode développeur et créer le certificat comme
ci-dessus. L'installeur est décrit dans
[packages/tv-installer](../../packages/tv-installer/README.md).

## Mettre à jour KROMA

Installez le nouveau `.wgt` de la même façon, signé avec le même profil. Le
téléviseur conserve l'adresse de votre serveur et reste connecté à votre
compte.

## Dépannage

### `Invalid certificate chain with certificate in signature`

Le paquet n'est pas signé avec un certificat créé pour ce téléviseur. Cela
arrive avec le `.wgt` tel que téléchargé, ou avec un profil dont le certificat
de distributeur ne contient pas ce téléviseur. Signez-le à nouveau avec votre
profil Samsung, comme dans [Installer KROMA](#installer-kroma).

### `Author certificate not match`

Un KROMA signé avec un autre certificat d'auteur est déjà installé sur le
téléviseur. Supprimez-le : dans **Applications**, maintenez enfoncée la touche
de sélection sur la vignette KROMA, puis choisissez **Supprimer**. Installez à
nouveau.

### L'ordinateur ne parvient pas à se connecter au téléviseur

Le mode développeur n'accepte qu'un seul ordinateur : celui dont vous avez
saisi l'adresse. Vérifiez que l'adresse dans la fenêtre **Mode développeur** du
téléviseur est l'adresse actuelle de votre ordinateur, et redémarrez le
téléviseur après l'avoir modifiée.

### KROMA a disparu du téléviseur

Une mise à jour du micrologiciel du téléviseur peut supprimer les applications
installées en mode développeur. Installez KROMA à nouveau, signé avec le même
profil.

### L'installeur indique que le téléviseur n'a pas autorisé l'installation

Certains téléviseurs demandent une autorisation une fois par certificat. Dans
le **Device Manager** de Tizen Studio, faites un clic droit sur le téléviseur
et sélectionnez **Permit to install applications**, puis installez à nouveau.
