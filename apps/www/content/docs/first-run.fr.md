# Premier démarrage : votre compte et vos bibliothèques

Ce guide vous mène d'un serveur qui vient de démarrer à votre premier film lu
dans un navigateur web. Il est le même quelle que soit la façon dont vous avez
installé le serveur. Comptez une dizaine de minutes, plus le temps dont KROMA a
besoin pour analyser vos fichiers.

## Avant de commencer

- Le serveur KROMA est en marche. Sinon, commencez par [Docker](docker.md),
  [Synology](synology.md) ou [un autre NAS](other-nas.md).
- Vous connaissez l'adresse du serveur sur votre réseau, par exemple
  `192.168.1.50`. Sur un NAS, c'est l'adresse avec laquelle vous ouvrez sa page
  d'administration.
- KROMA peut lire vos dossiers de médias. Consultez
  [Dossiers de médias et permissions](media-folders.md).
- Vous utilisez un ordinateur ou un téléphone connecté au même réseau que le
  serveur.

## Ouvrir KROMA

Dans un navigateur web, allez à l'adresse du serveur, sur le port `4040` :

```
http://192.168.1.50:4040
```

Remplacez `192.168.1.50` par l'adresse de votre serveur. Sur l'ordinateur qui
fait tourner le serveur, `http://localhost:4040` fonctionne aussi.

KROMA affiche le formulaire de création de compte. Si le navigateur n'arrive
pas à ouvrir la page, consultez
[Dépannage](troubleshooting.md#la-page-web-ne-souvre-pas).

## Créer le compte propriétaire

Le premier compte d'un nouveau serveur est le compte propriétaire. Il a toutes
les permissions, y compris sur les réglages du serveur.

1. Saisissez une adresse e-mail, un nom d'utilisateur et un mot de passe d'au
   moins 8 caractères.
2. Sélectionnez **Créer le compte**.

KROMA vous connecte et ouvre l'écran d'accueil. Tant que vous n'avez pas ajouté
vos propres dossiers, il affiche quelques titres de démonstration. Vous pouvez
ainsi vérifier que la lecture fonctionne.

> [!IMPORTANT]
> Créez le compte propriétaire depuis votre réseau domestique. Depuis
> l'extérieur, KROMA le refuse avec le message **Le compte propriétaire se crée
> depuis le réseau local du serveur**. Ainsi, personne sur Internet ne peut
> s'approprier un nouveau serveur avant vous.

Chaque compte suivant a besoin d'une invitation de votre part. Personne ne peut
s'inscrire seul.

## Ajouter vos bibliothèques

Une bibliothèque est un ensemble de dossiers qui contiennent un seul type de
média : des films ou des séries. KROMA lit les noms des dossiers et des fichiers
pour distinguer les films des épisodes. Si vos fichiers ne sont pas encore
nommés, suivez les [règles de nommage](media-folders.md#nommer-vos-fichiers).

1. Dans le menu, sélectionnez **Serveur**. L'administration s'ouvre.
2. Sous **Médias**, sélectionnez **Sources**.
3. Sélectionnez **Ajouter une bibliothèque**.
4. Dans **Nom**, saisissez un nom, par exemple `Films`.
5. Dans **Type de bibliothèque**, choisissez **Films** ou **Séries**.
6. Dans **Premier dossier**, sélectionnez **Choisir un dossier**, puis ouvrez le
   dossier qui contient vos fichiers.

   > [!NOTE]
   > La liste des dossiers montre le disque tel que le serveur le voit. Dans
   > Docker, c'est le chemin à l'intérieur du conteneur, par exemple
   > `/media/films`, et non le chemin sur votre NAS.

7. Sélectionnez **Créer**.

KROMA lance l'analyse. Les affiches, les résumés et la distribution
apparaissent à mesure qu'il identifie chaque titre. Pour quelques centaines de
fichiers, cela prend quelques minutes. Répétez ces étapes pour vos séries.

Si vous avez installé KROMA avec l'assistant Synology, ou défini
`KROMA_MOVIES_DIRS` et `KROMA_SERIES_DIRS`, KROMA a déjà créé une bibliothèque
**Films** et une bibliothèque **Séries** à partir de ces dossiers. Vérifiez-les
sous **Sources**, et renommez-les si vous le souhaitez.

## Lancer une lecture

1. Revenez à l'écran d'accueil.
2. Ouvrez un film et sélectionnez **Lecture**.

Si le film se lance, le serveur fonctionne. KROMA envoie le fichier tel quel à
chaque écran capable de le lire, et ne le convertit que pour un écran qui ne le
peut pas.

## Inviter les personnes avec qui vous partagez

1. Dans le menu, sélectionnez **Inviter un utilisateur**.
2. Choisissez ce que la personne peut faire, et combien de temps le lien reste
   valide.
3. Sélectionnez **Créer le lien d'invitation**, puis envoyez-lui le lien.

La personne ouvre le lien, crée son compte et voit vos bibliothèques.

## Étapes suivantes

- Installez l'application sur votre téléviseur : [Téléviseurs](tv.md).
- Installez l'application sur votre téléphone :
  [Téléphones et tablettes](mobile.md).
- Ajoutez d'autres fonctions, comme les sous-titres ou les téléchargements,
  sous **Serveur** > **Modules**.
