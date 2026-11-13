## À faire

- Sauvegardez votre serveur avant la mise à jour, avec **Exporter** dans **Admin > Sauvegarde**. Elle retire de l'**Historique de lecture** les lectures que personne n'a vues, sans retour à l'ancienne version.
- Après la mise à jour, acceptez les mises à jour de modules en attente dans **Admin > Modules > Mises à jour**. D'ici là, ces modules ne démarrent pas.

## Nouveautés

### Une suggestion à la fin du film
Sur le web et la TV, le lecteur ne reste plus figé à la fin d'un film. Il vous propose un titre proche, avec son résumé et les boutons **Lecture** et **Accueil**, sans rien lancer tout seul.

### Les bandes-annonces dans votre langue
Sur le web et la TV, **Bande-annonce** lance celle du titre dans le lecteur KROMA : doublée dans votre langue, sinon sous-titrée, sinon en VO. Il faut le module Trailers sur le serveur.

### Plus rapide et plus fluide
Sur une Samsung The Frame, l'accueil est fluide sur 97 % des images, contre 70 %, et la grille **Films** sur 90 %, contre 34 %. Sur TV et téléphone, la liste des films pèse 1,3 Mo au lieu de 4,9.

### Le web se pilote au clavier
**⌘K** ou **Ctrl+K** ouvre **Accès rapide**, pour aller à une page ou lancer une action. Dans le lecteur, chaque appui sur une flèche avance ou recule de 10 s, et le volume monte jusqu'à 200 %.

### Un nouveau lecteur sur téléphone
Sur téléphone, le lecteur s'ouvre à la verticale, avec la navigation et la barre de progression sous l'image. Si une lecture échoue, il en donne la raison et propose **Retour** et **Réessayer**.

### L'app Mac remplit sa fenêtre
L'app Mac occupe toute sa fenêtre, quelle que soit sa forme, sans bandes noires autour. Elle passe aussi un film en image dans l'image, avec lecture, pause et sauts de 10 s.

## Corrections

- Une série ne disparaît plus de **Reprendre la lecture** quand vous finissez un épisode.
- Un film en pause ne repart plus tout seul.
- Un remux ne se fige plus, et la reprise d'un film en cours ne charge plus indéfiniment.
- L'app Android se connecte à un serveur en http://, comme sur un réseau local.
- L'épisode suivant garde vos sous-titres complets, et le web reste en plein écran.
- Rechercher une série affiche la série elle-même, et non la liste de ses épisodes.
- **Lire sur la TV** depuis la fiche d'une série lance l'épisode au lieu de ne rien faire.
- Des séries regroupées dans un sous-dossier ne fusionnent plus en une seule.
- Sur iPhone, appuyer plusieurs fois sur Lecture ne lance plus un film impossible à arrêter.
- L'app Linux, SteamOS compris, ne s'ouvre plus sur un écran noir.

## Pour le propriétaire du serveur

- Votre serveur envoie chaque jour des statistiques anonymes à KROMA, désactivables dans **Admin > Général > Confidentialité**.
- Dans **Admin > Utilisateurs**, **Bibliothèques visibles** limite un membre à certaines bibliothèques, et **Réinitialiser l'accès** crée un lien de mot de passe.
- **Admin > Réseau** montre où chaque module se connecte, avec **Bloquer cet hôte** et **Passer par le VPN** pour chaque destination.
- À la maison, les apps joignent le serveur par son adresse locale, sans chiffrement. **Connexion directe à la maison**, dans **Admin > Réseau**, le désactive.
- Les modules s'installent sur toutes les plateformes. Avant l'installation, la carte **Sécurité** dit ce que chacun pourra lire, modifier et joindre.
- Si un qBittorrent ou Transmission externe enregistre hors des bibliothèques, ajoutez son dossier à **Dossiers de téléchargement**, dans **Admin > Acquisition**.
- Le paquet Synology passe de 158 Mo à 32 Mo.
- Les guides d'installation sont sur kroma.tv/docs. Sur une TV Samsung, `npx @kromatv/installer` installe KROMA sans Tizen Studio.
