# Dossiers de médias et permissions

KROMA lit vos films et vos séries dans les dossiers où ils se trouvent déjà. Il
ne les copie jamais dans une base de données ni dans un volume qui lui serait
propre. Cette page explique comment nommer vos fichiers pour que KROMA les
reconnaisse, et de quel accès KROMA a besoin sur vos dossiers.

## Nommer vos fichiers

KROMA lit les noms des dossiers et des fichiers pour distinguer un film d'un
épisode, et pour trouver la bonne affiche et le bon résumé. La plupart des
fichiers téléchargés ou extraits d'un disque fonctionnent déjà. Si un titre
n'est pas reconnu, renommez-le comme ci-dessous.

### Films

Placez chaque film dans son propre dossier, nommé avec le titre et l'année
entre parenthèses :

```
Films/
  Blade Runner 2049 (2017)/
    Blade Runner 2049 (2017).mkv
  The Matrix (1999)/
    The Matrix (1999) 1080p.mkv
```

C'est l'année entre parenthèses qui fait foi pour KROMA : `Blade Runner 2049 (2017)`
est donc le film *Blade Runner 2049* sorti en 2017. KROMA ignore les mentions
de qualité et de version, comme `1080p`, `BluRay` ou `x265`. Un dossier sans
sous-dossiers, avec des fichiers comme `The.Matrix.1999.1080p.mkv`, fonctionne
aussi.

### Séries

Placez chaque série dans son propre dossier, avec un dossier par saison :

```
Series/
  The Office (2005)/
    Season 01/
      The Office - S01E01 - Pilot.mkv
      The Office - S01E02 - Diversity Day.mkv
    Season 02/
      The Office - S02E01 - The Dundies.mkv
    Specials/
      The Office - S00E01 - Christmas Special.mkv
```

- Le numéro d'épisode est la partie que KROMA doit trouver : `S01E02`,
  `S01 E02`, `s1e2`, `1x02`, ou `S01E02-E03` pour un fichier qui contient deux
  épisodes. Le texte qui le suit devient le titre de l'épisode.
- Un dossier nommé `Season 01`, `Saison 1` ou `Specials` indique à KROMA que le
  dossier qui le contient est la série. KROMA prend alors le nom de ce dossier
  pour la série, quel que soit le nom des fichiers qu'il contient.
- Sans dossiers de saison, KROMA prend le nom de la série dans chaque nom de
  fichier. `Breaking.Bad.S01E01.mkv` et `The.Office.S01E01.mkv`, dans le même
  dossier, sont donc deux séries.
- Dans une bibliothèque ajoutée comme **Séries**, chaque fichier est un
  épisode, jamais un film. KROMA y lit aussi `S211E06`, `Episode 259`,
  `Ep. 259` et un numéro en tête de nom, comme dans `215 - Titre.mkv`. Si le nom
  ne donne pas de saison, l'épisode prend celle de son dossier de saison, sinon
  la saison 1. Un fichier dont le nom ne porte aucun numéro d'épisode est
  laissé de côté, et le journal du serveur nomme le premier.

### Sous-titres

Placez un fichier de sous-titres à côté de sa vidéo, avec le même nom suivi de
la langue :

```
The Matrix (1999).mkv
The Matrix (1999).en.srt
The Matrix (1999).fr.forced.srt
```

KROMA lit les fichiers `.srt`, `.ass`, `.ssa` et `.vtt`. Ajoutez `.forced` pour
des sous-titres forcés, et `.sdh` pour des sous-titres pour sourds et
malentendants. Un dossier `Subs` à côté de la vidéo fonctionne aussi. Les
sous-titres intégrés au fichier vidéo ne demandent rien.

### Affiches, fonds, logos et vignettes

KROMA trouve sur Internet une affiche, un fond et un logo pour chaque titre qu'il
reconnaît. Une image placée dans le dossier du titre passe avant eux, et donne
une affiche à un titre que KROMA ne reconnaît pas, à la place de l'image par
défaut :

```
Films/
  Summer Trip (2019)/
    Summer Trip (2019).mkv
    poster.jpg
    fanart.jpg
Series/
  School Plays/
    poster.jpg
    backdrop.jpg
    Season 01/
      poster.jpg
      School Plays - S01E01.mkv
      School Plays - S01E01-thumb.jpg
```

- Pour l'affiche d'un film, nommez l'image `poster`, `folder`, `cover`,
  `default` ou `movie`, dans le dossier du film. Dans un dossier qui contient
  plusieurs films, donnez-lui plutôt le nom de la vidéo : `Summer Trip (2019).jpg`
  ou `Summer Trip (2019)-poster.jpg`.
- Pour le fond d'un film, nommez-la `backdrop`, `fanart`, `background` ou `art`,
  ou, dans un dossier partagé, du nom de la vidéo :
  `Summer Trip (2019)-fanart.jpg`.
- Pour le logo, le nom du titre dessiné en image, nommez-la `logo` ou
  `clearlogo`, ou, dans un dossier partagé, du nom de la vidéo :
  `Summer Trip (2019)-logo.png`.
- Pour une série, placez les images dans le dossier de la série, au-dessus des
  dossiers de saison, avec les mêmes noms, ou `show` pour l'affiche. Quand deux
  séries partagent un dossier, aucune ne prend les images qu'il contient.
- Pour l'affiche d'une saison, nommez l'image `poster`, `folder`, `cover` ou
  `default` dans le dossier de la saison, ou du nom de la saison dans le dossier
  de la série : `season01-poster.jpg`, et `season-specials-poster.jpg` pour les
  épisodes spéciaux. Sans image dans les dossiers, une saison prend l'affiche
  trouvée sur Internet, sinon celle de la série.
- Pour la vignette d'un épisode, donnez à l'image le nom de la vidéo de
  l'épisode, suivi ou non de `-thumb` : `School Plays - S01E01-thumb.jpg`. Elle
  s'affiche même sur un épisode que KROMA ne reconnaît pas.
- KROMA lit les images `.jpg`, `.jpeg`, `.png` et `.webp`, et ignore celles qu'il
  ne peut pas ouvrir.
- Un fond ou un logo ne s'affiche que sur un titre que KROMA reconnaît.
- KROMA remarque une image ajoutée, modifiée ou supprimée comme il remarque une
  nouvelle vidéo. Une application peut mettre jusqu'à un jour à montrer le
  changement sur un écran déjà ouvert.

Pour changer l'image d'un titre sans toucher à son dossier, ouvrez le titre et
choisissez **Modifier les visuels**. Une affiche, un fond ou un logo envoyé à cet
endroit passe avant l'image du dossier et celle d'Internet, et **Rétablir l'image
automatique** les fait revenir. Sur la page d'une série, le bouton **Modifier la
vignette** d'un épisode fait de même pour la vignette de cet épisode, et
**Modifier l'affiche de la saison**, au-dessus des épisodes, pour l'affiche de
la saison à l'écran. Une affiche, un fond ou une vignette s'ouvre d'abord dans
un cadre à sa forme, 2:3 ou 16:9 : déplacez l'image, zoomez ou tournez-la, puis
choisissez **Utiliser cette image**. Un logo part tel quel et garde sa
transparence. Il faut le droit de gérer la bibliothèque.

Au lieu d'un fichier, **Depuis un lien** prend l'adresse d'une image sur
Internet. KROMA la télécharge une fois et la garde telle quelle, sans cadre.
Une adresse de votre propre réseau, comme celle de votre NAS, est refusée :
téléchargez l'image puis envoyez-la.

### Titres et résumés des fichiers .nfo

Un titre peut prendre son nom, son année, son résumé et ses genres dans un
fichier `.nfo`, celui que lisent Kodi, Jellyfin et Plex :

```
Films/
  Summer Trip (2019)/
    Summer Trip (2019).mkv
    Summer Trip (2019).nfo
Series/
  School Plays/
    tvshow.nfo
    Season 01/
      School Plays - S01E01.mkv
      School Plays - S01E01.nfo
```

- Pour un film, donnez au fichier le nom de la vidéo, ou appelez-le `movie.nfo`
  dans le dossier du film.
- Pour une série, placez `tvshow.nfo` dans le dossier de la série, au-dessus des
  dossiers de saison.
- Pour un épisode, donnez au fichier le nom de la vidéo de l'épisode. KROMA lit
  son `<title>`, son `<plot>` et son `<aired>`, le jour de sa première
  diffusion. Un fichier qui décrit plusieurs épisodes donne le premier.
- KROMA lit `<title>`, `<originaltitle>`, `<sorttitle>`, `<plot>`,
  `<premiered>` ou `<year>`, et chaque `<genre>`. Le fichier doit être en UTF-8,
  comme ces logiciels l'écrivent.
- Si le fichier donne le numéro TMDB du titre, dans `<uniqueid type="tmdb">` ou
  `<tmdbid>`, ou s'il se termine par le lien de sa page sur themoviedb.org,
  KROMA reconnaît le titre à ce numéro plutôt qu'à son nom. Une fiche corrigée
  avec **Corriger la fiche** passe avant le fichier.
- Si le fichier ne donne que le numéro IMDb ou TheTVDB du titre, dans
  `<uniqueid type="imdb">`, `<uniqueid type="tvdb">`, `<imdbid>` ou
  `<tvdbid>`, ou s'il se termine par le lien de sa page sur imdb.com, KROMA
  demande une fois à TMDB à quel titre correspond ce numéro, puis s'en sert
  pour reconnaître le titre.
- Le texte du fichier s'affiche à la place de celui trouvé sur Internet, même
  quand KROMA reconnaît le titre. Ce que vous écrivez avec **Modifier les
  informations** passe avant le fichier.
- KROMA lit un fichier ajouté ou modifié à la prochaine analyse de la
  bibliothèque.

### Types de fichiers

KROMA analyse les fichiers `.mkv`, `.mp4`, `.m4v`, `.mov`, `.webm`, `.avi` et
`.ts`.

### Raccourcis et liens

KROMA suit les liens symboliques. Une bibliothèque faite de liens qui pointent
vers un autre dossier est analysée comme si les fichiers s'y trouvaient, tout
comme une bibliothèque dont le dossier est lui-même un lien. Les titres se
lisent sur le nom du lien, pas sur celui du dossier visé. Dans Docker, le
dossier vers lequel pointent les liens doit aussi être monté dans le conteneur,
sinon KROMA ne peut pas ouvrir les fichiers.

## Choisir la lecture seule ou la lecture et l'écriture

KROMA ne fait que lire vos dossiers de médias, sauf si vous utilisez les modules
qui téléchargent et rangent des fichiers pour vous.

| Ce que vous utilisez | Accès dont KROMA a besoin |
| --- | --- |
| Parcourir et lire vos fichiers | Lecture |
| Sous-titres et illustrations | Lecture : KROMA les garde dans son propre dossier de données |
| Le module **Acquisition**, qui télécharge les titres demandés, les déplace dans vos bibliothèques et les renomme | Lecture et écriture |

Les données propres à KROMA, comme sa base de données, les affiches et les
téléchargements en cours, se trouvent dans son dossier de données. Ce dossier a
toujours besoin d'un accès en lecture et en écriture. Gardez-le séparé de vos
dossiers de médias.

> [!TIP]
> Si vous regardez seulement ce que vous avez déjà, donnez à KROMA un accès en
> lecture à vos médias. Rien de ce qu'il fait ne peut alors modifier vos
> fichiers. Vous pourrez accorder l'accès en écriture plus tard, quand vous
> installerez le module Acquisition.

## Donner à KROMA l'accès à vos dossiers

La façon de donner l'accès dépend de la façon dont vous avez installé KROMA :

- **Paquet Synology** : KROMA s'exécute avec son propre utilisateur, `kroma`.
  Accordez à cet utilisateur l'accès à chaque dossier partagé. Voir
  [Synology : donner à KROMA l'accès à vos médias](synology.md#donner-à-kroma-laccès-à-vos-médias).
- **Docker** : vous montez chaque dossier dans le conteneur, et l'utilisateur du
  conteneur doit avoir le droit de le lire, ou d'y écrire. Voir
  [Docker : dossiers de médias](docker.md#monter-vos-dossiers-de-médias).
- **QNAP, Unraid, TrueNAS** : voir [Autres NAS](other-nas.md).

Quand KROMA ne peut pas lire un dossier, l'analyse n'y trouve rien et le journal
du serveur indique pourquoi. Voir
[Dépannage](troubleshooting.md#une-bibliothèque-reste-vide-après-une-analyse).

## Médias sur un autre ordinateur

KROMA lit uniquement des dossiers locaux. Pour utiliser des films stockés sur un
autre NAS ou un autre ordinateur, montez d'abord ce partage, en SMB ou en NFS,
sur la machine qui exécute KROMA. Ajoutez ensuite le dossier monté comme
bibliothèque. Sur un partage réseau :

- l'analyse est plus lente : laissez-lui du temps la première fois ;
- KROMA ne voit pas les nouveaux fichiers dès leur arrivée, car les partages
  réseau ne signalent pas les changements. Il les trouve à la prochaine analyse
  périodique, toutes les cinq minutes par défaut (voir `KROMA_WATCH_INTERVAL`
  dans la [référence de configuration](configuration.md)), ou quand vous
  sélectionnez **Analyser** sous **Sources**.

## Téléchargements et imports rapides

Quand le module Acquisition importe un téléchargement terminé, il crée un lien
physique si le téléchargement et la bibliothèque sont sur le même disque et dans
le même montage. C'est instantané et cela n'occupe aucun espace supplémentaire.
Sinon, il copie le fichier : c'est plus long, et il faut de la place pour les
deux copies jusqu'à la suppression du téléchargement.

Dans Docker, deux montages séparés comptent comme deux disques, même s'ils se
trouvent sur le même volume du NAS. Cela convient à la plupart des gens. Si vous
voulez des imports instantanés, voir
[Docker : un seul montage pour les données et les médias](docker.md#facultatif--un-seul-montage-pour-les-données-et-les-médias).
