# German

What German software says, and how. Read it before you write a German string.

## Register

- **du**, lowercase: *du*, *dich*, *dir*, *dein*. A capital only at the start of a
  sentence. Netflix, Disney+, Spotify, YouTube, Apple and Plex address a German
  reader this way, and a media server at home is closer to them than to a bank.
  Microsoft and Prime Video still write *Sie*; we do not mix the two, ever.
- The imperative takes the du form: *Wähle*, *Gib … ein*, *Tippe*, *Drücke*,
  *Melde dich an*, *Versuche es später erneut*. No *Bitte* in front of every
  request: one *bitte* at most, in a sentence that asks the reader a favour.
- The product does not say *wir* about itself. Say *KROMA* or *der Server*.
- Short sentences, verbs over nouns. German runs about a third longer than the
  English, and a television button has little room: take the shorter natural
  word, split a noun pile into a noun and its complement (*Sprache der
  Untertitel*, not *Untertitelsprachenauswahl*), and drop a possessive English
  carried (*Profil speichern*, not *Dein Profil speichern*).
- Neutral words for people where they come for free (*Person*, *alle im
  Haushalt*). No gender star, colon or *Binnen-I* in the interface. A role keeps
  the generic form the platforms use: *Benutzer*, *Administrator*, *Eigentümer*.

## The form of each kind of string

| Kind | Form | Example |
|---|---|---|
| Button | infinitive, object first | *Speichern*, *Foto ändern*, *Server hinzufügen* |
| Button that speaks for the reader | the plain infinitive; German buttons rarely say *mein* | *Konto erstellen* (for *Create my account*) |
| Screen title | noun phrase, infinitive phrase, or a question | *Profil*, *Passwort zurücksetzen*, *Wer schaut gerade?* |
| Confirmation title | infinitive + `?` | *Profil löschen?*, *Änderungen verwerfen?* |
| Work in progress | *Wird* + participle + `…` | *Wird geladen…*, *Wird gespeichert…*, *Wird geprüft…* |
| Result | participle, or a short clause | *Gespeichert*, *Profil gespeichert*, *Dein Passwort ist festgelegt.* |
| Error with a subject | *… konnte nicht … werden.*, then what to do | *Der Server konnte nicht erreicht werden. Prüfe die Adresse und versuche es erneut.* |
| Short error toast | noun + *fehlgeschlagen*, or *nicht möglich* | *Speichern fehlgeschlagen*, *Anmeldung fehlgeschlagen* |
| Empty state | what is true, then the way out | *Noch keine Titel. Füge einen Medienordner hinzu.* |
| Hint | a full sentence with its full stop | *Jeder Ordner wird zu einer Bibliothek.* |
| Count | digits, a space, the noun in its plural form | *3 Staffeln*, *1 Folge*, *10 Sekunden* |
| Label, setting | noun phrase, sentence case | *Bevorzugte Audiosprache*, *Profilsperre* |

The German passive *konnte nicht … werden* is the idiom of German error
messages (Apple, Google, Microsoft all write it), unlike the French passive. Use
it where the English names the thing that failed. Never *Fehler beim …* as a
sentence: it is a status, not a message.

## Typography

- No space before `.` `,` `:` `;` `!` `?`; one after.
- The ellipsis is one character, `…`, joined to the word: *Wird geladen…*, as
  Google and Microsoft write it. Never three dots.
- Quotation marks: `„ “` for a quoted title or label, `‚ ‘` inside one. Never
  `" "`.
- A dash in a sentence is an en dash with spaces, ` – `, and is rarely needed: a
  colon or a full stop reads better. A range is an en dash with no spaces:
  *1–50*, *Montag–Freitag*.
- Numbers: decimal comma, a point for thousands (*1.234*, *1,5 GB*). The
  project's formatter writes them; a hand-written one follows the same rule.
- A space between a number and its unit, a percent sign included: *5 GB*,
  *10 Mbit/s*, *50 %*, *4K* stays together.
- Abbreviations with their points and a space: *z. B.*, *d. h.*, *ca.*,
  *Std.*, *Min.*, *Sek.*
- Durations as Netflix and Apple TV write them: *1 Std. 45 Min.*, *45 Min.*,
  *3 Tg. 4 Std.*; a seek step or a countdown keeps the SI *s*: *10 s zurück*,
  *Weiter in 5 s*. A relative time: *vor 5 Min.*, *vor 2 Std.*, *gerade eben*.
- An episode code: *S1:F3* (Staffel, Folge), as Netflix writes it; a season
  alone *S1*. A metadata line keeps the source's separator: *S1 · F3*.
- An age band: *Ab 12*, *Alle Altersstufen*. Not *12+*.
- Capitals: every noun, as German grammar wants, and the first word. Otherwise
  sentence case, in titles and buttons too: *Bevorzugte Audiosprache*, never
  *Bevorzugte Audio Sprache*. After a colon, a capital only when a whole
  sentence follows.
- Compounds with a Latin name, an abbreviation or a digit take a hyphen, never
  a space: *KROMA-Konto*, *TMDB-ID*, *HDR-Video*, *4K-Video*, *E-Mail-Adresse*,
  *IP-Adresse*, *PIN-Eingabe*. A product name with its own spelling stays
  outside the compound: *mit Face ID*, not *Face-ID-Entsperrung*.
- A placeholder is never the first half of a compound (*{name}-Profil*). Write
  *das Profil von {name}* or *Profil „{name}“*.
- Product names stay Latin: KROMA, TMDB, Tizen, webOS, Roku, Samsung, LG,
  Docker, Synology, GitHub, Apple TV, Android TV, Face ID, Touch ID.
- Codec and format names stay as written: HEVC, H.264, H.265, AV1, VP9, AAC, DTS,
  TrueHD, Atmos, HDR, Dolby Vision, NZB, RSS, VPN, SSO, SQL, HTTPS, IP.
- A word, not a symbol: *und*, *oder*. Not `+`, not `/`, not `&` (except where
  a TMDB genre name has one).
- Keep every `{placeholder}` exactly as the source spells it, including repeats.
- Keep markup exactly: `[KROMA]`, `*Settings*`, backticks, Markdown, HTML, URLs,
  `$t(...)`.

## Fixed vocabulary

| English | German | Never |
|---|---|---|
| Settings | Einstellungen | Optionen, Setup |
| Library | Bibliothek | Library, Mediathek |
| Media library | Medienbibliothek | |
| Movie | Film | Movie |
| Series, show | Serie | Show, TV-Sendung |
| Season | Staffel | Season |
| Episode | Folge | Episode (as Netflix and Disney+ write it) |
| Title (a movie or series) | Titel | Werk, Inhalt |
| Content | Inhalte | Content |
| Play (the button) | Abspielen | Wiedergeben, Spielen, Play |
| Playback | Wiedergabe | Abspielung |
| Resume | Fortsetzen | Wiederaufnehmen |
| Continue Watching (the row) | Weiterschauen | Weiter ansehen, Fortsetzen |
| Watch (a verb in a sentence) | ansehen | gucken |
| Pause | Pausieren (button), Pausiert (state) | |
| Stop | Stoppen | Anhalten (which is pause) |
| Skip intro | Intro überspringen | Intro skippen |
| Next episode | Nächste Folge | |
| Subtitles | Untertitel | Subs |
| Audio | Audio | Ton (except *Ton aus*) |
| Audio track | Tonspur | Audiospur |
| Audio language | Audiosprache | Tonsprache |
| Dub, dubbed | Synchronfassung, synchronisiert | gedubbt |
| Quality | Qualität, Bildqualität | |
| Resolution | Auflösung | |
| Bitrate | Bitrate | Bitrage |
| Codec | Codec | Kodek |
| Transcode, transcoding | transkodieren, Transkodierung | konvertieren (only when the source says convert) |
| Direct play | Direkte Wiedergabe | Direct Play, Direktabspielen |
| Stream, streaming | Stream, streamen | |
| Buffer, buffering | Puffern, wird gepuffert | buffern |
| Server | Server | |
| Client | App, or Client in an admin sentence | |
| Profile | Profil | |
| Account | Konto | Account |
| User | Benutzer | User, Nutzer |
| Administrator, admin | Administrator; Admin in a short label | Verwalter |
| Owner (of the server) | Eigentümer | Besitzer, Owner |
| Household | Haushalt | Familie (unless the source says family) |
| Dashboard | Übersicht | Dashboard |
| Home | Startseite | Home, Zuhause |
| Search (the tab) / Search (the action) | Suche / Suchen | |
| Discover | Entdecken | |
| Watchlist | Merkliste | Watchlist |
| My list | Meine Liste | |
| Favorites | Favoriten | |
| Request (a title) | Anfrage, anfragen | Request, beantragen |
| Download | Herunterladen, Download | Runterladen |
| Upload | Hochladen | Uploaden |
| Folder | Ordner | Verzeichnis (except in a path sentence for admins) |
| File | Datei | File |
| Path | Pfad | |
| Storage | Speicher, Speicherplatz | Storage |
| Network | Netzwerk | Netz |
| Local network | lokales Netzwerk | LAN (in a sentence) |
| LAN address | Adresse im lokalen Netzwerk | LAN-Adresse |
| Remote access | Fernzugriff | Remote-Zugriff |
| Connection | Verbindung | Konnektivität |
| Sign in / Sign out | Anmelden / Abmelden | Einloggen, Ausloggen, Login |
| Signed in (a state) | Angemeldet | Eingeloggt |
| You are signed out | Du bist abgemeldet. | Du wurdest ausgeloggt |
| Sign in failed | Anmeldung fehlgeschlagen | Login fehlgeschlagen |
| Invalid credentials | Benutzername oder Passwort ist falsch | Ungültige Anmeldedaten |
| Sign-in provider | Anmeldedienst | Identitätsanbieter (except in an admin SSO sentence) |
| Password | Passwort | Kennwort |
| Passkey | Passkey (der Passkey, die Passkeys) | Hauptschlüssel, Zugangsschlüssel |
| Security key | Sicherheitsschlüssel | |
| One-time code | Einmalcode | Einmal-Passwort |
| PIN | PIN (die PIN) | der PIN, PIN-Nummer |
| Profile lock | Profilsperre | Profilschloss |
| Biometric unlock | Biometrische Entsperrung | |
| Email | E-Mail, E-Mail-Adresse | Email, Mail |
| Username | Benutzername | Username |
| Invitation, invite | Einladung, einladen | Invite |
| Invitation link | Einladungslink | |
| Invite a user | Person einladen | User einladen |
| Permission, rights | Berechtigung, Rechte | Permission |
| Module | Modul | |
| Plugin | Plugin | Erweiterung (unless the source says extension) |
| Feature | Funktion | Feature |
| Job, task | Aufgabe | Job, Task |
| Queue | Warteschlange | Queue |
| Queued (a stage) | Wartet | In der Queue |
| Pipeline | Verarbeitung, Verarbeitungskette | Pipeline |
| Backup | Backup | Sicherungskopie |
| Restore | Wiederherstellen | Restoren |
| Update (noun / verb) | Update / aktualisieren | Aktualisierung on a short label |
| Update available | Update verfügbar | Neue Version |
| Release (software) | Version | Release |
| Release (a torrent or an NZB) | Release (das Release) | Version, Veröffentlichung |
| Version | Version | |
| Build | Build | Kompilat |
| Build (to build a module) | bauen, neu bauen | builden, kompilieren |
| Release channel | Update-Kanal | Release-Kanal |
| Genre | Genre | |
| Director | Regie | Direktor |
| Cast | Besetzung | Cast |
| Actor | Darsteller | Schauspieler (in a credit list) |
| Crew | Crew | Team |
| Rating (a score) | Bewertung | Rating |
| Age rating | Altersfreigabe | Altersbewertung, Rating |
| Runtime | Laufzeit | Dauer (except for a file's duration) |
| Overview, synopsis | Handlung | Übersicht, Zusammenfassung |
| Trailer | Trailer | Vorschau |
| Artwork | Bilder | Artwork, Kunstwerk |
| Poster | Poster | Plakat |
| Backdrop | Hintergrundbild | Backdrop |
| Avatar | Profilbild for a photo, Avatar for a drawn one | |
| Theme | Design | Theme |
| Appearance | Darstellung | Aussehen, Erscheinungsbild (too long for TV) |
| Device | Gerät | Device |
| TV (the device, in a sentence) | Fernseher | TV-Gerät, Fernsehgerät |
| TV (a short label, a kind of app) | TV | |
| Television (a kind of device) | Fernseher | Fernsehen, which is the medium |
| Session | Sitzung | Session |
| Token | Token | |
| Log, logs | Protokoll, Protokolle | Logs, Logdatei |
| Error | Fehler | Error |
| Warning | Warnung | |
| Success | Fertig, erfolgreich | Erfolg! |
| Failed | Fehlgeschlagen | Gescheitert |
| Loading | Wird geladen… | Lädt…, Laden… |
| None | Keine, Ohne | Nichts |
| All | Alle | |
| Unknown | Unbekannt | |
| Enabled / Disabled | Aktiviert / Deaktiviert | Eingeschaltet / Ausgeschaltet |
| On / Off | Ein / Aus | An / Aus |
| Automatic | Automatisch | Auto |
| Custom | Benutzerdefiniert, Eigene in a short list | Custom |
| Default | Standard | Default |
| Default (a track flag) | Standard | Voreinstellung |
| Optional | Optional | Freiwillig |
| Required (a form field) | Pflichtfeld, erforderlich | Benötigt |
| Use at least 8 characters, 8+ characters | Mindestens 8 Zeichen | 8+ Zeichen |
| Apply | Anwenden | Übernehmen |
| Apply to the selection, 3 picked | Auf Auswahl anwenden (3) | , 3 ausgewählt |
| Save | Speichern | Sichern |
| Delete / Remove | Löschen / Entfernen | |
| Clear (a field, a search) | Löschen | Leeren, Clearen |
| Clear (a PIN, metadata) | Entfernen | |
| Reset | Zurücksetzen | Resetten |
| Continue | Weiter | Fortfahren |
| Done (a button, a keyboard key) | Fertig | Erledigt |
| Cancel | Abbrechen | Stornieren |
| Close | Schließen | |
| Back | Zurück | |
| Retry | Erneut versuchen | Wiederholen |
| Mute / Unmute | Stummschalten / Ton einschalten | Mute |
| Muted (the volume) | Stumm | Gemutet |
| Volume | Lautstärke | Volumen |
| Fullscreen | Vollbild | Fullscreen |
| Picture in picture | Bild-in-Bild | PiP |
| Playback speed | Wiedergabegeschwindigkeit; Tempo in a tight menu | Abspielgeschwindigkeit |
| Aspect ratio | Seitenverhältnis | |
| Subtitle delay | Untertitelverzögerung | |
| Sync | Synchronisieren, Synchronisierung | Syncen |
| Controls (of the player) | Steuerung | Kontrollen, Controls |
| Timeline, scrub bar | Zeitleiste | Timeline, Scrubbar |
| Storyboard (seek previews) | Vorschaubilder | Storyboards |
| Intro and credits detection | Intro- und Abspannerkennung | Credits-Erkennung |
| Theme song (of a series) | Titelmelodie | Theme-Song |
| Bandwidth | Bandbreite | |
| Mb/s | Mbit/s | Mb/s, MBit/s |
| Port | Port | |
| Port forwarding | Portweiterleitung | Port öffnen |
| Host | Host | |
| Certificate | Zertifikat | |
| Firewall | Firewall | |
| Torrent | Torrent | |
| Seeder / Peer | Seeder / Peer | |
| Seeding (a torrent) | Wird geseedet | Seeding |
| The swarm | die Peers | der Schwarm |
| Indexer | Indexer | Indizierer |
| Usenet | Usenet | |
| Webhook | Webhook | |
| Blocklist | Sperrliste | Blacklist |
| Two-factor authentication | Zwei-Faktor-Authentifizierung | 2FA alone |
| Recovery code | Wiederherstellungscode | Recovery-Code |
| Cache | Cache | Zwischenspeicher |
| Snapshot | Snapshot | Momentaufnahme |
| Migration | Migration | |
| Scan | Scan, scannen | Durchsuchen, which is search |
| Probing (a file) | Dateianalyse, analysieren | Probing |
| Metadata | Metadaten | |
| Match (a title) | zuordnen, erkennen | matchen |
| Fix the match, rematch | Zuordnung korrigieren, neu zuordnen | Rematchen |
| Media details (the file's codecs) | Dateidetails | Mediendetails |
| Media, media items (a count) | Titel; *Filme und Serien* in a sentence | Medien, Medieninhalte |
| Acquisition (the module) | Beschaffung | Akquise, Erwerb |
| Kill switch | Kill Switch | Notschalter, Killswitch |
| Uptime | Läuft seit {duration}, Betriebszeit | Uptime |
| Last year (a time range) | Letzte 12 Monate | Letztes Jahr |
| Top users | Aktivste Benutzer | Top-User |
| Supervise (a process) | überwachen | supervisen |
| Skip (a step) | Überspringen | Skippen |
| Skip (a queue, a step that waits) | ohne Wartezeit, sofort | überspringen |
| Set up, setup | einrichten, Einrichtung | Setup, aufsetzen |
| Tap to (on a phone) | Tippe, um … | Klicke, Drücke |
| Press (a remote's button) | Drücke | Klicke |
| Select (with the remote) | auswählen | selektieren |
| S1E3, Play S1E3 | S1:F3, S1:F3 abspielen | S1E3, Staffel 1 Folge 3 (in a chip) |
| 3 of 10, 3/10 | 3 von 10 | 3 / 10 |
| 1-50 of 200 (a page) | 1–50 von 200 | 1-50 / 200 |
| Text subtitles | Textuntertitel | Text-Untertitel |
| Remuxed, repackaged | Container live angepasst | geremuxt |
| Ready to watch (a notification) | Jetzt verfügbar | Bereit zum Ansehen |
| Critically acclaimed | Von der Kritik gefeiert | Kritikerlob |
| A-Z (a sort) | Alphabetisch | A-Z |
| AI suggestions | KI-Vorschläge | AI-Vorschläge |
| e.g. | z. B. | z.B., bspw. |
| Admin (the area), console | Verwaltung | Admin-Bereich, Konsole |
| Link / Unlink (a sign-in provider) | Verknüpfen / Trennen | Linken, Entlinken |
| Link a device, Quick Connect | Gerät verknüpfen, Schnellverbindung | Quick Connect |
| Has already been used (a link, a code) | wurde bereits verwendet | ist bereits benutzt |
| At any time | jederzeit | zu jeder Zeit |
| Roku (the device) | Roku-Gerät | die Rokus |
| Mail server | E-Mail-Server | Mailserver |
| Middleware (modules that filter connections) | Verbindungsfilter | Middleware |
| Config (a WireGuard file) | Konfiguration | Config |
| Discard your changes? | Änderungen verwerfen? | Änderungen wegwerfen? |
| No account with us (the project) | kein KROMA-Konto nötig | kein Konto bei uns |
| est. (estimated) | ca. | geschätzt (on a chip) |
| Whoever publishes it | der Herausgeber | wer es veröffentlicht |
| Imported (a play) | Importiert | |
| Issuer (OpenID Connect) | Aussteller | Issuer, except in parentheses |
| ID token | ID-Token | |
| Interface language | Anzeigesprache | Interface-Sprache, Oberflächensprache |
| Preferred (a language) | Bevorzugte | Präferierte |
| Member since | Mitglied seit | |
| Notifications | Benachrichtigungen | Mitteilungen (Apple only) |
| Phone (the device) | Smartphone | Handy, Telefon |
| Remote (control) | Fernbedienung | Remote |
| Connect a device (pairing a TV or phone) | Gerät verbinden | Gerät koppeln |
| Play on TV, cast | Auf dem Fernseher abspielen; Stop casting: Übertragung beenden | casten |
| Skip recap | Rückblick überspringen | Recap überspringen |
| Credits (end of a title) | Abspann | Credits |
| Up next | Als Nächstes | Up Next |
| Trending | Im Trend, Aktuell im Trend | Trending |
| Featured | Empfohlen | Featured |
| Watch again | Noch einmal ansehen | Erneut schauen |
| Mark as watched / unwatched | Als gesehen / ungesehen markieren | Als angeschaut markieren |
| To watch (a filter) | Ungesehen | Zu schauen |
| Similar titles | Ähnliche Titel | |
| Summary (of a title) | Handlung | Zusammenfassung |
| Tagline | Slogan | Tagline |
| Original title | Originaltitel | |
| Sort title | Sortiertitel | |
| Air date / release date | Erstausstrahlung / Erscheinungsdatum | Release-Datum |
| Writer, writing (a credit) | Drehbuch | Autor |
| Creator (of a series) | Schöpfer | Ersteller |
| Acting (a department) | Schauspiel | |
| Forced (subtitles) | Erzwungen | Forced |
| Generate (a subtitle) | erstellen | generieren |
| Transcribe | transkribieren | |
| AI (a badge, a prefix) | KI, KI-Vorschläge | AI |
| Opacity | Deckkraft | Opazität |
| Font | Schriftart | Font |
| Edge style of subtitles (none, uniform, shadow, raised, depressed) | Rand: Keine, Kontur, Schatten, Erhöht, Vertieft | |
| Space (a keyboard key) | Leertaste | Space |
| Keyboard layout | Tastaturlayout | |
| Downloaded / Downloading | Heruntergeladen / Wird heruntergeladen | Gedownloadet |
| Biometric unlock (with Face ID or Touch ID) | Biometrische Entsperrung, *Face ID oder Touch ID* | Face ID / Touch ID |
| Who's watching? | Wer schaut gerade? | Wer guckt? |
| Quit (the app) | Beenden | Verlassen |
| Bug report | Fehlerbericht | Bugreport |
| Crash report | Absturzbericht | Crash-Report |
| A genre name TMDB translates | TMDB's German name, spelled as TMDB spells it: Abenteuer, Komödie, Krimi, Dokumentarfilm, Familie, Historie, Musik, Liebesfilm, Science Fiction, TV-Film, Kriegsfilm | a rewrite: KROMA matches stored genres against these labels |
| A genre name TMDB sends in English to a German reader (Action & Adventure, Kids, News, Reality, Sci-Fi & Fantasy, Soap, Talk, War & Politics) | a German label of its own: Action und Abenteuer, Kinder, Nachrichten, Reality-TV, Sci-Fi und Fantasy, Seifenoper, Talkshow, Krieg und Politik | |
| Monitored, followed (a title the server fetches for) | überwacht, überwachte Titel, überwachen, nicht mehr überwachen (as Sonarr and Radarr write it in German). The English says both *monitor* and *follow* for this one act: German says *überwachen* for both | beobachtet, gemonitort, folgen |
| On disk (a file the server holds) | vorhanden | auf der Festplatte (in a chip) |
| Grabbed, on the way (a download started) | unterwegs | gegrabbt |
| Gaps (missing episodes) | Lücken | Gaps |
| Specials (season 0) | Specials | Sonderfolgen |
| Preset (of monitored episodes, of network settings) | Vorlage, Vorlagen; Vorlage anwenden | Preset, Vorgabe |
| Registry (a module catalog) | Registry (die Registry, die Registries); the official one: die offizielle Registry | Verzeichnis, Register |
| The Acquisition module, by name | „Beschaffung“ | Acquisition |
| Grab (a release) | holen | grabben, schnappen |
| Upgrade (a better release) | Verbesserung, bessere Version | Upgrade |
| Cutoff (quality a profile stops at) | Ziel, the same word as the profile's *Goal*: *Ziel erreicht*, *Alles hat sein Ziel erreicht* | Cutoff, Qualitätsgrenze |
| Recycle bin | Papierkorb | Recycle Bin |
| Relay (kroma.tv's mail or push relay) | Relay (das Relay) | Weiterleitung, Relais |
| Enrichment (metadata) | Anreicherung, anreichern | Enrichment |
| Embedding (a vector) | Embedding, Embeddings | Einbettung |
| Fingerprint (audio, picture) | Fingerprint, Fingerprint-Modus | Fingerabdruck |
| Incremental | inkrementell | |
| Loudness | Lautheit (EBU R128), Lautstärke for the volume | |
| Run (of a job) / Last run / Next run | Lauf / Zuletzt / Nächster Lauf | Run |
| Schedule (of a job) | Zeitplan | Schedule |
| Cron expression | Cron-Ausdruck | |
| Host updater | Update-Programm des Hosts | Host-Updater |
| Tracker; private, semi-private, public | Tracker; privat, halbprivat, öffentlich | semi-privat |
| Digest (a summary email) | Übersicht | Digest |
| Watch state | Gesehen-Status | Watch-Status |
| Missing (the episodes view) | Fehlend | Vermisst |
| Franchise | Filmreihe | Franchise |
| Spotlight (a person) | Porträt | Spotlight |
| Element (a row of the processing pipeline: a film, an episode, a series) | Eintrag, Einträge | Element |
| Stage, step, treatment (of the processing pipeline) | Schritt, Verarbeitungsschritt | Stufe, Behandlung |
| Queued (a stage waiting its turn) | Wartet | In Warteschlange |
| Reprocess | neu verarbeiten, Neuverarbeitung | erneut prozessieren |
| Probe (ffprobe), short label | Datei; in prose: Dateianalyse | Probe, Medien |
| Storyboards, previews (timeline thumbnails) | Vorschaubilder | Storyboards |
| Markers (episode intro and credits), short label | Intro/Abspann; in prose: Intro- und Abspannmarken | Marker |
| Credits (a film's end credits) | Abspann | Credits |
| Approve / deny, decline (a request) | genehmigen / ablehnen | approven, verweigern |
| Report (a viewer's problem report) | Meldung, Problemmeldung, melden | Report |
| Settled, resolved (a notification, a report) | Erledigt, Erledigt von {user}; a report: Problem behoben | Gelöst |
| Request (HTTP, on the performance page) | Anfrage, HTTP-Anfrage (the page is clear from context) | Request |
| Call (of a function, a module, HTTP) | Aufruf, Aufrufe, pro Aufruf | Call |
| Statement (SQL) | Anweisung | Statement |
| Query plan | Abfrageplan | Query-Plan |
| Full scan (SQL) | Tabellenscan | Full Scan |
| Performance (the admin page) | Leistung | Performance |
| Playback engine | Wiedergabe-Engine; the engines: Samsung-Player, mpv-Player, VLC-Player, Browser-Player, Shaka Player, Remux auf dem Server | Wiedergabe-Motor |
| Home Screen (iOS) | Home-Bildschirm (Apple's German) | Startbildschirm |
| Report (the admin page and its queue) | Meldungen (the page, `admin.navReports`), Meldung, Problemmeldung | Berichte, Reports |
| Dismiss / resolve / reopen (a report) | Schließen, geschlossen / Als behoben markieren, behoben / Wieder öffnen | Verwerfen, Lösen |
| Join request (sign-in provider) | Beitrittsanfrage; approve: zulassen, deinen Beitritt zulassen | |
| Pending (a request awaiting approval) | Ausstehend | Wartend |
| Release notes / What's new | Versionshinweise / Neuigkeiten | Was ist neu |
| Fix (a line of the release notes) | Fehlerbehebung, Behoben | Fix |
| Free search / Interactive search (indexers) | Freie Suche / Interaktive Suche | |
| Score (of a release) | Punkte | Score |
| Upcoming (episodes) | Demnächst | Bevorstehend |
| Bring over (import from Plex or Jellyfin) | übernehmen, wird übernommen | rüberbringen, mitbringen |
| Marker detection (the job) | Intro- und Abspannerkennung (`jobs.pipeline.markers.name`); film credits: Abspannerkennung bei Filmen | Markererkennung |
| Stats for nerds | Statistiken für Nerds (YouTube's German) | |
| Dropped frames / Stalls | Verlorene Frames / Unterbrechungen | |
| Config (WireGuard) | Konfiguration, WireGuard-Konfiguration | Config |
| Tunnel up / down / sealed | Tunnel verbunden / getrennt / dicht | |
| Port forwarding | Portweiterleitung | Port-Forwarding |
| Location (a VPN exit) | Standort | Ort |
| Client ID, client secret, ID token, redirect URI, issuer | Client-ID, Client-Secret, ID-Token, Weiterleitungs-URI (Keycloak's German), Issuer (with *Adresse des Anmeldedienstes* in a label) | Kunden-ID, Redirect-URI, Client-Geheimnis |
| Signing key | Signaturschlüssel | Signierschlüssel |
| Application (at the sign-in provider) | Anwendung | Applikation |
| Watch history (the admin screen) | Wiedergabeverlauf; Verlauf in a short label | Schauverlauf |
| Management (the admin nav group of dashboard, users, history, reports) | Verwalten, keeping *Verwaltung* for the whole admin area | |
| Clear the cache | Cache leeren | Cache löschen |
| Remote / local (a stream) | Extern / Lokal | Remote |
| Volumes (storage) | Datenträger | Volumes |
| Kids profile / profile picker | Kinderprofil / Profilauswahl | Kids-Profil |
| Extension point; a module answers it; called by | Erweiterungspunkt; stellt bereit, nicht bereitgestellt; aufgerufen von | beantwortet |
| Inert (a module whose needs nothing answers) | Wirkungslos | Inaktiv |
| Custom format / format score | eigenes Format / Punkte, Punktzahl, Formatpunktzahl | Custom Format, Score |
| Quality ladder / rung | Qualitätsstufen / Stufe | Qualitätsleiter |
| Season pack | Staffelpaket | Season-Pack |
| Ratio (torrent) / down, up totals | Verhältnis / Empfangen, Gesendet | Ratio |
| Tokens (in a filename template) | Platzhalter | Tokens |
| WireGuard bridge (the VPN module's WireGuard to SOCKS5 link) / sealed | Brücke / dicht. The core's *Tunnel* labels (`vpn.*`) stay *Tunnel verbunden / getrennt* | Bridge |
| Package Center (Synology DSM) | Paket-Zentrum (DSM's German) | Paketzentrum |
| Roku channel | Kanal (*Kanal installieren*) | Channel |
| Forget (a stored sign-in) | Entfernen (*Diese Anmeldung entfernen*) | Vergessen |
| Reasoning (an AI model) / AI provider | Nachdenken / Anbieter (Anmeldedienst stays for sign-in) | Reasoning |
| Menu path in prose | arrows, as the website writes it: *Verwaltung → Module*, *Einstellungen → Netzwerk → Info* | commas (*Server, Netzwerk, E-Mail*) |
| Language names (`lang.*`) | CLDR's German names (`Intl.DisplayNames('de')`), except Hmong, Schottisch-Gälisch and Odia, which read better than CLDR's Miao, Gälisch (Schottland) and Oriya | |
| `vocab.*` (words the server recognises in a query or a synopsis, never shown) | the German words, with the declined forms a synopsis uses (*wahren Begebenheiten*); `vocab.numbers` keeps nine words, two to ten | a translation of the English list |

## Calques to avoid

| Written | Why it is wrong | Write |
|---|---|---|
| Erfolgreich gespeichert | *successfully* is noise | Gespeichert |
| Dein Profil speichern (a button) | the English possessive | Profil speichern |
| Mein Konto erstellen | French and English *my* on a button | Konto erstellen |
| Bitte gib dein Passwort ein | a *bitte* on every instruction | Gib dein Passwort ein. |
| Du bist startklar, Du bist bereit | *you are all set* | Fertig, Alles eingerichtet |
| Hol mehr aus deiner Bibliothek heraus | *get more from* | Nutze deine Bibliothek besser |
| Das macht Sinn | *makes sense* | Das ist sinnvoll |
| Wir konnten den Server nicht erreichen | the product says *wir* | Der Server konnte nicht erreicht werden |
| Fehler: Datei nicht gefunden | an English colon for a status | Die Datei wurde nicht gefunden. |
| Zeige alle 12 Geräte | the English word order on a button | Alle 12 Geräte anzeigen |
| KROMA Server, TMDB Daten | an English space in a compound | KROMA-Server, TMDB-Daten |
| in 2024 | *in 2024* | 2024, im Jahr 2024 |
| realisieren (that something happened) | *realize* | merken, bemerken |
| Klicke hier | names the gesture, not the act | name the action on the button |
| Der Server spricht mit dir, wartet auf dich | the product does a human thing | Der Server ist bereit |
| Einloggen | an anglicism the platforms dropped | Anmelden |
| Untertitelsprachenpräferenz | a noun pile | Bevorzugte Untertitelsprache |
| Inhalte konsumieren | *consume media* | Filme und Serien ansehen |
| Es ist nicht möglich, … zu … | a dummy *es* where a verb does it | … kann nicht … |
| Diese Einstellung ist über … | *is about* | Diese Einstellung legt … fest |
| Dieses Video ist zu groß für dieses Gerät | *too big* said of a resolution | Die Auflösung ist zu hoch für dieses Gerät |
| {codec}-Audio, {name}-Profil | a placeholder as half a compound | Ton im Format {codec}, das Profil von {name} |
| Lass uns dich zurück zu deiner Bibliothek bringen | *let's get you back*, and the product says *uns* | Kehre zu deiner Bibliothek zurück. |
| Die Wiedergabe wurde vom Administrator gestoppt | an English passive where an active is shorter | Ein Administrator hat die Wiedergabe beendet. |
| Starte einen Film oder eine Folge, und sie läuft auf … | a pronoun that cannot agree with both nouns | Was du jetzt startest, läuft auf … |
| 7+, 13+ | an English age band | Ab 7, Ab 13 |
| Titel (A-Z) | an English sort label | Alphabetisch |

## Phrases the code puts together

Some messages are pieces the code joins: read the code before you write them,
since German case and word order have to survive every join.

- **A purpose** (`modulePermissions.purpose*`) is read alone on a detail line
  and inside a sentence. Write it as *zum* or *zur* + a noun: *zum Abrufen von
  Film- und Seriendetails*, *zur Suche in Indexern*. It then works alone and
  inside *Kontaktiert {to} {why}* and *Nimmt eingehende Verbindungen {why} an*.
- **A destination** (`toAnywhere`, `toSetting`, a host) is read alone and as the
  object of the summary, so the summary takes a verb with the accusative,
  where nominative and accusative agree: *Kontaktiert beliebige Websites*,
  *Kontaktiert die eingestellte Adresse*. *Verbindet sich mit …* would need a
  dative the bare phrase does not have.
- **A reason** (`verdict*`) follows a module's name: a verb in the third
  person, lowercase, *startet ffmpeg auf deinem Server*.
- **A list** is *{head} und {last}*, with no comma before *und*.
- **A placeholder the code fills with a label** takes the case of its sentence:
  `email.reset.codeLabel` is *8-stelligen Code* because `codeNote` says *den
  {code}*.

- **The sign-in provider in `sso.*`** is a name (*Google*, *Authentik*) or,
  when the code has none, `sso.yourProvider`. That fallback is *deinem
  Anmeldedienst*, a dative, so every `sso.*` sentence puts `{provider}` after
  *mit*, *bei*, *von* or *zwischen*: *Verknüpfung mit {provider}
  fehlgeschlagen*, *Du hast die Anmeldung bei {provider} abgebrochen*, *Von
  {provider} kam keine E-Mail-Adresse*. Never `{provider}` as a subject or a
  direct object there.
- **An admin toast about a title** (`requests.toast*`, `reports.toast*`,
  `monitoring.toastFollowed` / `Unfollowed` / `Updated`,
  `pipeline.toastReprocess`) is a whole sentence holding `„{title}“`, with no
  full stop. Name what was acted on when it is not the title itself: *Anfrage
  für „{title}“ genehmigt*, *Meldung zu „{title}“ geschlossen*, *„{title}“ wird
  überwacht*. `pipeline.toastRetry` is *Schritt „{stage}“ neu gestartet*, and a
  row subtitle over stage names is *Fehlgeschlagen: {names}*, *Läuft: {names}*.
- **A label after a number** (`pipeline.trackedLabel`, `needActionLabel`,
  `reports.totalLabel`, `openLabel`, `setup.scanFound`) is lowercase unless it
  is a noun: *Einträge erfasst*, *mit Handlungsbedarf*, *Meldungen*, *offen*.
- **A count the source does not pluralise** (`requests.missingCount`,
  `notifications.media.added.body`): write a form that reads right for 1 and
  for 12, *Fehlend: {count}*, *Neu in der Bibliothek: {count} Titel*, rather
  than *{count} fehlen*.
- **A count on a selection button** goes in parentheses: *Auswahl anfragen
  ({count})*.

## Plurals

CLDR gives German two categories, `one` and `other`. Write the bare key as the
general form (it is what `other` reads) and `key_one` for the singular. Nothing
else: there is no `few` or `many` in German. `key_zero` only where the source
has one and a sentence for zero reads better (*Keine Ergebnisse*).

A noun after a placeholder count takes its plural in the bare key and its
singular in `_one`: *{count} Folgen* / *{count} Folge*. Where the noun does not
change (*{count} Titel*, *{count} Server*), `_one` still differs if an article or
a verb does (*{count} Titel wurde hinzugefügt* / *wurden hinzugefügt*).

## Turns that make German sound German

- A verb at the end, not a noun: *Gib die Adresse ein*, not *Eingabe der
  Adresse*.
- *noch* for *yet*: *Noch keine Passkeys.*
- *Keine … mehr* for *no longer*: *Dieses Gerät ist nicht mehr angemeldet.*
- *jederzeit*, *gleich danach*, *sofort*: short adverbs a person says.
- A colon for a cause or a result: *Zu viele Versuche: Dieser Link ist gesperrt.*
- *bereits* for *already* in a message, *schon* in a casual hint.
- *pro* or *je* for *each* in a count: *eine Bibliothek pro Ordner*.
