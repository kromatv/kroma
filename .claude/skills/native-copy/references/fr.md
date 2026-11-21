# French

What French software says, and how. Read it before you write a French string.

## Register

- **Vous**, always. Never *tu*. The product does not say *nous* about itself.
- Warm and direct, never stiff. No *veuillez*, no *afin de*, no *merci de*.
- Short sentences. One idea per sentence. A colon often joins two English ones.
- Prefer words that fit everyone (*vos proches*, *chaque personne*, *le compte*)
  to a doubled form. No *point médian* in an interface.

## The form of each kind of string

| Kind | Form | Example |
|---|---|---|
| Button | infinitive | *Enregistrer*, *Continuer*, *Lancer l'analyse* |
| Button that speaks for the reader | infinitive + *mon / ma* | *Créer mon compte*, *Ouvrir ma bibliothèque* |
| Screen title | a question, a noun phrase, or an imperative in *vous* | *Par où commencer ?*, *Statistiques anonymes*, *Invitez vos proches* |
| Work in progress | noun + *en cours…* | *Installation en cours…* |
| Result | past participle or short clause | *Installé*, *Votre compte est créé* |
| Error | *Impossible de* + infinitive, then what to do | *Impossible d'ajouter ce dossier. Vérifiez que le serveur peut y accéder, puis réessayez.* |
| Empty state | what is true, then the way out | *Aucune langue ne correspond à votre recherche.* |
| Hint | a full sentence, with its full stop | *Chaque dossier devient une bibliothèque.* |

Never *n'a pas pu être* + participle for an error: it is the English passive.

## Typography

- A no-break space (U+00A0) before `:` `;` `!` `?` `%` and inside `« »`.
- One character for the ellipsis: `…`.
- Sentence case. Only the first word and proper names take a capital, in titles too.
- Digits for a number the reader acts on: *7 jours*, *8 caractères minimum*.
- Decimal comma, units *Ko*, *Mo*, *Go*. The project's formatter writes them.
- A word, never a symbol: *et*, *ou*. Not `+`, not `/`.
- The straight apostrophe `'`, never `’`. *E-mail* with a hyphen, never *email*.
- No comma before the *ou* or the *et* that ends a list: *a expiré, a déjà servi
  ou n'existe pas*.

## Fixed vocabulary

| English | French | Never |
|---|---|---|
| Settings | Réglages | Paramétrages |
| Search (action) | Rechercher | Chercher |
| Save | Enregistrer | Sauver, Sauvegarder |
| Probing (a file) | analyse des fichiers | probing, sonde |
| Timeline, scrub bar | barre de lecture | timeline |
| Queued (a stage) | En attente | En file |
| Delete / Remove | Supprimer / Retirer | Effacer |
| Clear (a PIN, metadata) | Supprimer | Effacer |
| Storyboard (seek previews) | aperçus | storyboards |
| Intro and credits detection | détection des génériques | détection intro / générique |
| Pipeline | chaîne de traitement, Traitement in a menu | pipeline |
| Kill switch | coupe-circuit | kill switch |
| Uptime | En service depuis {durée} | Disponibilité |
| Last year (a time range) | Les 12 derniers mois | L'année dernière |
| Top users | Utilisateurs les plus actifs | Top des utilisateurs |
| Theme song (of a series) | générique | musique de thème |
| Mb/s | Mbit/s | Mb/s |
| 0 = auto, Empty = none (a field's hint) | 0 pour…, Laissez vide pour… | = |
| Skip | Passer cette étape, Ignorer | Sauter |
| Sign in / Sign out | Se connecter / Se déconnecter | Login |
| Set up, setup | Configurer, la configuration | Installation, setup |
| Library | Bibliothèque | Médiathèque, Librairie |
| Media (your files) | vos films et vos séries | vos médias |
| Release (a torrent or an NZB) | version | release |
| Apply to the selection, 3 picked | Appliquer à la sélection (3) | , 3 choisis |
| Scan | Analyse, analyser | Scan, scanner |
| Controls (of the player) | Commandes | Contrôles |
| Mute (the button) | Couper le son | Muet |
| S1E3, Play S1E3 | S1 É3, Lecture S1 É3 | S1E3 |
| 3 of 10, 3/10 | 3 sur 10 | 3 / 10 |
| Text subtitles | sous-titres au format texte | sous-titres texte |
| Remuxed, repackaged | conteneur adapté à la volée | remuxé |
| Match (a title) | Identifier | Matcher, faire correspondre |
| Ready to watch (a notification) | Disponible | Prêt à regarder |
| {title} was added, was approved | Nouveau dans la bibliothèque : {title}; Votre demande pour {title} est approuvée | {title} a été ajouté, whose gender a title does not tell |
| Not even us (the product) | pas même KROMA | pas même nous |
| Continue Watching | Reprendre la lecture | Continuer à regarder |
| Trailer | Bande-annonce | Trailer |
| Play (the button that starts a title) | Lecture | Lire, Jouer |
| My list | Ma liste, dans ma liste | dans votre liste |
| Critically acclaimed | Salué par la critique | Acclamé |
| A-Z (a sort) | de A à Z | A-Z |
| AI suggestions | Suggestions de l'IA | Suggestions IA |
| Update available | Mise à jour disponible | Nouvelle version |
| Invite a user | Inviter quelqu'un | Inviter un utilisateur |
| Subtitles | Sous-titres | |
| Download / Upload | Télécharger / Importer, Envoyer | Uploader |
| Optional | Facultatif | Optionnel |
| e.g. | Par exemple | Ex :, ex. |
| Logs | journaux | logs |
| Blocklist | liste de blocage | liste noire |
| Port forwarding | redirection de port | ouverture de port |
| Supervise (a process) | surveiller | superviser |
| Owner | Propriétaire | Possesseur |
| Seeding (a torrent) | En partage | Seed |
| The swarm | les pairs | le swarm |
| 1-50 of 200 (a page) | 1 à 50 sur 200 | 1-50 sur 200 |
| Required (a form field) | Ce champ est obligatoire | Ce champ est requis |
| Use at least 8 characters | 8 caractères minimum | Utilisez au moins 8 caractères |
| Admin (the area) | l'administration | l'admin |
| Rights, permissions | Droits | Permissions |
| Invitation link | Lien d'invitation | |
| Feature | Fonctionnalité | Feature |
| At any time | à tout moment | n'importe quand |
| Email | e-mail, adresse e-mail | email, mail, courriel |
| Clear (a field, a search) | Effacer | Vider |
| Done (a button that closes a step, a keyboard key) | OK | Terminé |
| Sign in failed | Impossible de se connecter | Connexion impossible, Échec de la connexion |
| Invalid credentials | Identifiant ou mot de passe incorrect | Identifiants invalides |
| Passkey | Clé d'accès | Passkey |
| One-time code | Code à usage unique | |
| 8+ characters | 8 caractères minimum | 8+ caractères, 8 caractères ou plus |
| Link a device, Quick Connect | Associer un appareil, la connexion rapide | Lier un appareil |
| Has already been used (a link, a code) | a déjà servi | a déjà été utilisé |

## Calques already made here, and what was meant

| Written | Why it is wrong | Write |
|---|---|---|
| Votre bibliothèque arrive | *arrive* is the English *is arriving* | Votre bibliothèque prend forme |
| Visible par les utilisateurs partagés | *shared users* word for word | Visible par les personnes invitées |
| Inclure ce que ce serveur fait tourner | *what this server runs* | Inclure les modules et les langues utilisés |
| Le lecteur de {user} sera arrêté | English passive | La lecture s'arrêtera tout de suite pour {user} |
| Cette installation ne sait pas redémarrer | the installation as a person | ne peut pas redémarrer le serveur d'elle-même |
| Qui d'autre regarde ici ? | word for word | Invitez votre famille et vos amis |
| Retournons à votre bibliothèque | the product says *nous* | Revenez à votre bibliothèque |
| Connexion directe (on a button) | a noun on a button | Se connecter directement |
| Proches (the people a server is shared with) | *proche* also means *near*, so the word is read two ways | votre famille et vos amis, les personnes invitées; *Invitations* for the step |
| Être compté | English idiom *be counted* | Statistiques anonymes |
| Tirer plus de votre bibliothèque | *get more from* | Lecture et recherche |
| Chercher par le sens | nobody says it | Recherche intelligente |
| Cette vidéo est trop grande pour cet appareil | *too big* said of a resolution | Résolution trop élevée pour cet appareil |
| Cet appareil ne sait pas lire son format | the device does a human thing | cet appareil ne lit pas son format |
| S'il refuse encore (the server) | the server as a person | Si la lecture est encore refusée |
| Que doit faire ce serveur en plus ? | English word order | Envie d'aller plus loin ? |
| Choisissez la langue dans laquelle KROMA vous parle | the product does a human thing | Choisissez votre langue. |
| Où sont vos médias ? | *médias* is jargon | Où sont vos films et vos séries ? |
| À couper le souffle (*edge of your seat*) | says *breathtaking*, a thing of beauty | Suspense garanti |
| Virées nocturnes néon | a noun pile in the English order | Virées nocturnes sous les néons |
| Soirées d'automne cosy | an English word where French has an image | Soirées d'automne au coin du feu |
| Reprendre mon serveur Plex | *reprendre* says another thing | Migrer depuis Plex ou Jellyfin |
| Le compte n'a pas pu être créé | English passive | Impossible de créer le compte |
| Regarder le catalogue + reprise | a symbol for a word, and a noun pile | Regarder les films et les séries, et reprendre une lecture |
| Est-ce un fichier de sauvegarde KROMA valide ? | an error asked as a question | Impossible d'importer ce fichier. Vérifiez qu'il s'agit bien d'une sauvegarde KROMA. |
| La lecture va caler | a car's word for a stall | La lecture va s'interrompre |
| Départ (a step name) | too short to mean anything | Point de départ |
| Création du compte impossible | a noun and *impossible*, the English *failed* | Impossible de créer le compte |
| Session expirée, veuillez vous reconnecter | *veuillez*, and a comma for a full stop | Votre session a expiré. Reconnectez-vous. |
| Ou rejoignez avec un compte que vous avez déjà | *join with* word for word | Ou inscrivez-vous avec un compte existant |
| Le nom d'utilisateur ne peut pas être vide | a rule stated about the field | Indiquez un nom d'utilisateur |

## One screen, one thing to know

A hint that carries two or three facts reads as a legal notice, in any language,
and French makes it longer. Keep the one fact the reader needs to act now, and
move the rest to the screen where it matters.

| Written | Write |
|---|---|
| Utilisez le compte du propriétaire ou d'un administrateur de ce serveur. KROMA garde cette connexion pour relancer l'import, et l'oublie dès que vous le demandez. | Connectez-vous avec un compte administrateur de ce serveur. |
| KROMA se contente de le lire : rien n'est modifié sur votre autre serveur, et vous pouvez continuer à l'utiliser. | Choisissez le serveur que vous utilisez aujourd'hui. |

## Turns that make French sound French

- *À chacun son compte.* The distributive, where English says *one each*.
- *Ne … que* for *only*: *L'analyse ne fait que lire vos dossiers.*
- *Inutile de* + infinitive for *you do not need to*.
- A colon for cause or result: *Ne prenez que l'utile : un module se retire à tout moment.*
- *Là où* for *where you left off*: *Chacun reprend là où il s'était arrêté.*
- *Prendre forme*, *se poursuivre*, *tout seul*, *s'occuper de*: verbs a person uses.

## Terms of the administration

| English | French | Never |
|---|---|---|
| Mail server | serveur de messagerie | serveur mail |
| Upload (an image, a file) | Importer | Téléverser |
| Discard your changes? | Abandonner les modifications ? | Abandonner les changements ? |
| Create their account (one person) | Créer son compte | Créer leur compte |
| Allowed on the relay (a server) | autorisé sur le relais | le relais a été autorisé pour ce serveur |
| Console (the admin area) | l'administration | la console |

