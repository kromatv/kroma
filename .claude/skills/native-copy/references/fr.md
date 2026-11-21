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

- A no-break space (U+00A0) before `:` `;` `!` `?` and inside `« »`.
- One character for the ellipsis: `…`.
- Sentence case. Only the first word and proper names take a capital, in titles too.
- Digits for a number the reader acts on: *7 jours*, *8 caractères minimum*.
- Decimal comma, units *Ko*, *Mo*, *Go*. The project's formatter writes them.
- A word, never a symbol: *et*, *ou*. Not `+`, not `/`.
- Follow the apostrophe and the spelling of *e-mail* the catalog already uses.

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
| Skip | Passer cette étape, Ignorer | Sauter |
| Sign in / Sign out | Se connecter / Se déconnecter | Login |
| Set up, setup | Configurer, la configuration | Installation, setup |
| Library | Bibliothèque | Médiathèque, Librairie |
| Media (your files) | vos films et vos séries | vos médias |
| Scan | Analyse, analyser | Scan, scanner |
| Match (a title) | Identifier | Matcher, faire correspondre |
| Continue Watching | Reprendre la lecture | Continuer à regarder |
| Trailer | Bande-annonce | Trailer |
| Subtitles | Sous-titres | |
| Download / Upload | Télécharger / Importer, Envoyer | Uploader |
| Owner | Propriétaire | Possesseur |
| Admin (the area) | l'administration | l'admin |
| Rights, permissions | Droits | Permissions |
| Invitation link | Lien d'invitation | |
| Feature | Fonctionnalité | Feature |
| At any time | à tout moment | n'importe quand |

## Calques already made here, and what was meant

| Written | Why it is wrong | Write |
|---|---|---|
| Votre bibliothèque arrive | *arrive* is the English *is arriving* | Votre bibliothèque prend forme |
| Qui d'autre regarde ici ? | word for word | Invitez votre famille et vos amis |
| Proches (the people a server is shared with) | *proche* also means *near*, so the word is read two ways | votre famille et vos amis, les personnes invitées; *Invitations* for the step |
| Être compté | English idiom *be counted* | Statistiques anonymes |
| Tirer plus de votre bibliothèque | *get more from* | Lecture et recherche |
| Chercher par le sens | nobody says it | Recherche intelligente |
| Que doit faire ce serveur en plus ? | English word order | Envie d'aller plus loin ? |
| Choisissez la langue dans laquelle KROMA vous parle | the product does a human thing | Choisissez votre langue. |
| Où sont vos médias ? | *médias* is jargon | Où sont vos films et vos séries ? |
| Reprendre mon serveur Plex | *reprendre* says another thing | Migrer depuis Plex ou Jellyfin |
| Le compte n'a pas pu être créé | English passive | Impossible de créer le compte |
| Regarder le catalogue + reprise | a symbol for a word, and a noun pile | Regarder les films et les séries, et reprendre une lecture |
| Départ (a step name) | too short to mean anything | Point de départ |

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
