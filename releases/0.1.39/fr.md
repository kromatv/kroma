## À faire

- Avant la mise à jour, exportez une sauvegarde dans **Admin > Sauvegarde**. Cette version modifie la base de données sans retour possible. Sous Docker, l'image s'appelle désormais `ghcr.io/kromatv/kroma`.
- Ensuite, mettez à jour vos modules dans **Admin > Modules > Mises à jour**, sinon ils ne démarrent pas. Sur iPhone, iPad et Apple TV, installez KROMA TV depuis https://testflight.apple.com/join/ZjgQdunW

## Nouveautés

### Une suggestion en fin de film
Sur le web et à la télévision, le lecteur ne reste plus figé à la fin d'un film. Il affiche le titre qui lui ressemble le plus, avec son résumé, **Lecture** et **Accueil**, sans lecture automatique.

### Le catalogue dans la langue de chacun
Titres, résumés, genres et affiches suivent la **Langue de l'interface** de chaque compte. Sur un même serveur, un compte en anglais voit Arrival et un compte en français, Premier Contact.

## Corrections

- Finir un épisode ne retire plus la série de **Reprendre la lecture**.
- Un film en pause ne repart plus tout seul.
- Un remux ne se fige plus, et reprendre un film en cours ne charge plus sans fin.
- Chercher une série affiche la série, et non plus chacun de ses épisodes.
- L'app Linux ne s'ouvre plus sur une fenêtre noire, y compris sous SteamOS.

## Pour le propriétaire du serveur

- Votre serveur envoie chaque jour un relevé anonyme à KROMA, sauf si vous désactivez **Statistiques d'utilisation anonymes** dans **Admin > Général > Confidentialité**.
- Dans **Admin > Utilisateurs**, **Bibliothèques visibles** limite un membre aux bibliothèques choisies. Il ne trouve ni ne lit plus les titres des autres.
- **Réinitialiser l'accès**, dans **Admin > Utilisateurs**, crée un lien pour le membre qui a oublié son mot de passe. Transmettez-le à la main ou par votre serveur SMTP.
