# Spanish

What Spanish software says, and how. Read it before you write a Spanish string.

One catalog, `es`, for every Spanish reader: Spain and Latin America. Write the
Spanish both sides read as their own. Where the two genuinely split and no
shared word exists, take Spain's (the servers we know of are there), and record
the choice in the table below.

## Register

- **Tú**, always, and one reader at a time. Never *usted*, never *vosotros*,
  never *vos*. Netflix, Disney+, Prime Video, Spotify, YouTube, Apple and Google
  all address the Spanish reader with *tú*, on both sides of the Atlantic.
- When a sentence speaks to a household, it still speaks to the one person
  reading: *Invita a tu familia*, not *Invitad*.
- The product does not say *nosotros* about itself. Say *KROMA*, or an impersonal
  *se*: *Se ha guardado*, *No se puede conectar*.
- Warm and direct, never stiff. No *por favor* in an instruction, no *le
  rogamos*, no *con el fin de*.
- **Gender-neutral wording about the reader.** The interface does not know who
  is reading, so no adjective or participle agrees with the reader: *Te damos la
  bienvenida*, not *Bienvenido*; *¿Todo listo?*, not *¿Listo?*; *Se ha cerrado la
  sesión*, not *Has cerrado sesión y estás desconectado*. No `@`, no `-x`, no
  `-e`, no *o/a*.
- **Tenses that both sides share.** Prefer the present and the participle, which
  read the same everywhere: *No se puede conectar*, *Cambios guardados*. When a
  past is needed for a single event that just happened, use the *pretérito
  perfecto* (Spain): *No se ha podido guardar*, *Se ha enviado el enlace*.
- Short sentences. One idea per sentence. Spanish runs 15 to 25 % longer than
  English: when a sentence does not fit, find a shorter natural one, do not drop
  the articles out of a long one.

## The form of each kind of string

| Kind | Form | Example |
|---|---|---|
| Button, menu item | infinitive | *Guardar*, *Cancelar*, *Reproducir*, *Iniciar sesión*, *Añadir carpeta* |
| Button that speaks for the reader | infinitive + *mi* | *Crear mi cuenta*, *Ir a mi biblioteca* |
| Tab, section | noun | *Inicio*, *Películas*, *Series*, *Ajustes*, *Mi lista* |
| Screen title | noun phrase or question | *Perfiles*, *Ajustes de la cuenta*, *¿Quién está viendo?* |
| Instruction | imperative with *tú* | *Elige un perfil.*, *Introduce el código que aparece en el televisor.* |
| Work in progress | gerund + `…`, or noun + *en curso…* | *Cargando…*, *Guardando…*, *Escaneando…*, *Instalación en curso…* |
| Result | participle or short clause | *Guardado*, *Copiado*, *Cambios guardados*, *Se ha enviado el enlace* |
| Error | *No se puede* / *No se ha podido* + infinitive, then what to do | *No se puede conectar con el servidor. Comprueba la dirección y la red.* |
| Empty state | what is true, then the way out | *Todavía no hay títulos. Añade una carpeta de vídeos para empezar.* |
| Hint | a full sentence with its full stop | *Cada carpeta se convierte en una biblioteca.* |
| Count | digits + noun, plural forms | *3 temporadas*, *1 temporada*, *10 s*, *2 h 15 min* |
| Toggle state | participle | *Activado*, *Desactivado* |

Never *Error al* + infinitive as a whole error message: it is the English
*Failed to*. Say what could not be done and what to do: *No se ha podido cargar
la lista. Vuelve a intentarlo.* *Error* alone is fine as a title or a status.
Never *Fallo* or *Falló* for a failure: it is a status, write *Error* or a
sentence.

## Typography

- Opening marks are mandatory: *¿Quién está viendo?*, *¡Listo!* (an exclamation
  is rare in an interface; most of the time, none at all).
- No space before `.` `,` `:` `;` `?` `!`; one space after.
- One character for the ellipsis: `…`, with no space before it.
- Quotation marks: `“ ”` for a quoted title, label or search, `‘ ’` only inside
  them. The straight apostrophe `'` never appears in Spanish words.
- Sentence case everywhere, titles included: only the first word and proper names
  take a capital. *Seguir viendo*, *Ajustes de reproducción*, never *Seguir
  Viendo*. Days, months and language names are lowercase in a sentence:
  *lunes*, *enero*, *inglés*, *subtítulos en francés*. A language name that
  starts a list item takes its capital: *Inglés*.
- A colon is followed by a lowercase letter in running text (*Error: el archivo
  no existe*), except after a label or before a quoted sentence.
- Numbers: digits for anything the reader acts on (*7 días*, *mínimo 8
  caracteres*). The formatter writes the decimal separator and the thousands
  separator of the reader's locale; never write them by hand. A space between a
  number and its unit: *4 GB*, *10 s*, *25 Mb/s*. The percent sign takes a space
  too, as the RAE writes it: *50 %*; where the source glues `{percent}%`, write
  `{percent} %`.
- A thousands separator written by hand (in a limit, a hint) is a no-break
  space (U+00A0), as the RAE and ISO write it: *10 000*. Never a comma or a
  full stop, which Spain and Mexico read the opposite ways.
- Units are the international symbols, unchanged: *KB*, *MB*, *GB*, *TB*, *Mb/s*,
  *s*, *min*, *h*. No full stop after a symbol.
- Ordinals in a compact label: *T1* for season 1, *E3* for episode 3. The
  compact episode chip is *T1:E3*, as Netflix and Disney+ write it in Spanish;
  with a separator from the source, keep it: *T1 · E3*.
- A word, not a symbol: *y*, *o*. Not `+`, not `/`, not `&`, except in a genre
  name TMDB spells with `&`.
- No serial comma before the *y* or the *o* that ends a list: *películas,
  series y documentales*.
- What stays Latin and unchanged: KROMA, TMDB, Trakt, Plex, Jellyfin, Emby, Tizen,
  webOS, Roku, Apple TV, Android TV, Chromecast, AirPlay, Samsung, LG, Docker,
  Synology, GitHub, WireGuard, codec and format names (HEVC, H.264, H.265, AV1,
  VP9, AAC, AC3, EAC3, DTS, TrueHD, Atmos, HDR, HDR10, HDR10+, Dolby Vision, SDR,
  MKV, MP4, SRT, ASS, PGS), protocols and acronyms (HLS, HTTP, HTTPS, DNS, VPN,
  SSO, NZB, RSS, IP, URL, API, PIN, QR).
- Acronyms keep the English form when that is what Spanish uses (*VPN*, *URL*,
  *PIN*, *HDR*) and the Spanish form when there is one in use: *IA* for AI,
  *ONU* is not needed here.
- Keep every `{placeholder}` exactly as the source spells it, including repeats.
- Keep markup exactly: `[KROMA]`, `*Settings*`, backticks, Markdown, HTML, URLs,
  `$t(...)`.

## Fixed vocabulary

| English | Spanish | Never |
|---|---|---|
| Settings | Ajustes | Configuraciones, Preferencias (for the whole screen) |
| Configure, set up | Configurar, la configuración | Setear, el setup |
| Library | Biblioteca | Librería, Mediateca |
| Media library | biblioteca multimedia | |
| Media (your files) | tus películas y series, vídeos | tus medios, media |
| Movie, film | Película | Film, Filme |
| Series, show | Serie, series | Show, programa (unless the source says program) |
| Season | Temporada | Estación |
| Episode | Episodio | Capítulo (Spain says it, but the services write *episodio*) |
| Title (a movie or series) | título | contenido (unless the source says content) |
| Content | contenido | |
| Video | vídeo | video (Spain's accent is the choice) |
| Watch | Ver | Mirar |
| Play (the button that starts a title) | Reproducir | Jugar, Play |
| Play S1E3 | Reproducir T1:E3 | Reproducir S1E3 |
| Resume (a title) | Reanudar | Resumir, Continuar |
| Continue Watching (the row) | Seguir viendo | Continuar viendo |
| Start over | Ver desde el principio | Empezar de nuevo |
| Pause | Pausa (a state), Pausar (a button) | |
| Stop | Detener | Parar |
| Skip intro | Saltar intro | Omitir introducción |
| Skip credits, Next episode | Siguiente episodio | Saltar créditos (unless the source says so) |
| Credits (end of an episode) | créditos | títulos de crédito |
| Watched, unwatched | Visto, Sin ver | Mirado, No mirado |
| Mark as watched | Marcar como visto | |
| Subtitles | Subtítulos | Subs, Leyendas |
| Forced subtitles | Subtítulos forzados | |
| Audio | Audio | Sonido (unless the source says sound) |
| Audio track | Pista de audio | Track |
| Dub, dubbed | doblaje, doblado | |
| Original version | Versión original, V. O. | |
| Quality | Calidad | |
| Resolution | Resolución | |
| Bitrate | tasa de bits | bitrate, velocidad de bits |
| Codec | códec, códecs | codec |
| Transcode, transcoding | transcodificar, transcodificación | convertir (only when the source says convert) |
| Direct play | Reproducción directa | Play directo |
| Stream, streaming | transmitir, transmisión; *streaming* as a noun | estrimear |
| Buffering | Cargando… | Bufferizando |
| Server | Servidor | |
| Client | Cliente | |
| Profile | Perfil | |
| Account | Cuenta | |
| User | Usuario | Usuaria/o |
| Person (in a sentence about who uses the server) | persona | individuo |
| Administrator | Administrador | Admin |
| Admin (the area) | Administración | Admin, Consola |
| Owner | Propietario | Dueño |
| Dashboard | Panel | Dashboard, Tablero |
| Home (the tab) | Inicio | Casa, Home |
| Search (the action, a button) | Buscar | Búsqueda (on a button) |
| Search (the screen, the field) | Búsqueda; placeholder *Buscar…* | |
| Discover, browse | Explorar | Navegar, Descubrir (on a tab) |
| My list | Mi lista, en mi lista | Lista de deseos, Watchlist |
| Favorites | Favoritos | |
| Request (a title) | solicitud, solicitar | petición, pedir |
| Download / Upload | Descargar / Subir | Bajar, Cargar (for upload) |
| Folder | Carpeta | Directorio (unless the source says directory) |
| File | Archivo | Fichero |
| Path | Ruta | Camino, Path |
| Storage | almacenamiento | storage |
| Network | Red | |
| Remote access | Acceso remoto | Acceso a distancia |
| Connection | Conexión | |
| Sign in / Sign out | Iniciar sesión / Cerrar sesión | Loguearse, Acceder (on the button), Desloguearse |
| Sign up, create an account | Crear una cuenta, Registrarse | Inscribirse |
| Signed out (a state) | Se ha cerrado la sesión | Estás desconectado |
| Password | Contraseña | Clave, Password |
| Passkey | llave de acceso | clave de acceso, passkey |
| PIN | PIN, código PIN | pin |
| One-time code | código de un solo uso | código OTP |
| Two-factor authentication | verificación en dos pasos | 2FA alone |
| Recovery code | código de recuperación | |
| Email | correo electrónico, correo | email, e-mail, mail, emilio |
| Invitation, invite | invitación, invitar | |
| Invitation link | enlace de invitación | link |
| Link (a URL) | enlace | link, vínculo |
| Link / Unlink (an account, a sign-in provider, a device) | Vincular / Desvincular | Linkear, Enlazar |
| Permission, rights | permisos | derechos |
| Module | Módulo | Plugin (unless the source says plugin) |
| Job, task | tarea | trabajo, job |
| Queue | cola | fila |
| Queued (a stage) | En cola | Encolado |
| Pipeline | cadena de procesamiento; *Procesamiento* in a menu | pipeline |
| Backup | copia de seguridad | backup, respaldo |
| Restore | Restaurar | Restablecer (which is Reset) |
| Update | actualización, actualizar | update, upgrade |
| Update available | Actualización disponible | Nueva versión disponible |
| Release (a software release) | versión | release, lanzamiento |
| Release (a torrent or an NZB) | versión | release |
| Version | versión | |
| Build | compilación | build |
| Release channel | canal de versiones | canal de lanzamiento |
| Genre | Género | Categoría |
| Director | Dirección (the credit), director (the person) | |
| Cast | Reparto | Elenco, Casting |
| Actor | actor, intérprete | |
| Crew | Equipo técnico | Crew |
| Rating (a score) | puntuación | rating, nota |
| Rating (an age rating) | clasificación por edades | rating |
| Runtime | Duración | Tiempo de ejecución |
| Overview, synopsis | Sinopsis | Resumen, Descripción general |
| Trailer | Tráiler, tráileres | Trailer, Avance |
| Artwork | imágenes | arte, artwork |
| Poster | póster | cartel (fine, but one word: póster) |
| Backdrop | imagen de fondo | backdrop |
| Logo | logotipo, logo | |
| Theme (appearance) | Tema | |
| Light / Dark | Claro / Oscuro | |
| Device | Dispositivo | Aparato, Equipo (Equipo is the computer) |
| Computer | equipo | ordenador, computadora |
| Phone | teléfono | móvil, celular |
| Television (the device) | televisor; *TV* in a label | la tele, televisión (which is the medium) |
| Remote (control) | mando a distancia, mando | control remoto (Spain's word is the choice) |
| Press (a key, a button) | Pulsa | Presiona, Aprieta |
| Tap (on a phone) | Toca | Pulsa, Presiona |
| Click | Haz clic | Clica, Cliquea |
| App | app | aplicación (fine in a long sentence, but one word: app) |
| Add | Añadir | Agregar (Spain's word is the choice) |
| Remove (from a list) | Quitar | Remover |
| Delete | Eliminar | Borrar (which is Clear), Suprimir |
| Clear (a field, a search, a PIN) | Borrar | Limpiar, Vaciar |
| Edit | Editar | Modificar (on a button) |
| Save | Guardar | Salvar, Grabar |
| Cancel | Cancelar | Anular |
| Close | Cerrar | |
| Back | Atrás | Regresar, Volver atrás |
| Next / Previous | Siguiente / Anterior | Próximo |
| Done (a button that closes a step) | Listo | Hecho, Terminado |
| OK | Aceptar | OK, Vale |
| Continue | Continuar | Seguir (on a button) |
| Retry | Reintentar | Volver a probar |
| Skip (a step) | Omitir | Saltar (Saltar is only for intro and credits) |
| Apply | Aplicar | |
| Reset | Restablecer | Resetear, Reiniciar (which is Restart) |
| Restart | Reiniciar | Resetear |
| Refresh | Actualizar | Refrescar |
| Show / Hide | Mostrar / Ocultar | Esconder |
| More | Más | |
| See all | Ver todo | Ver todos (unless the noun is masculine plural) |
| None | Ninguno, Ninguna (agree with the noun meant) | Nada |
| All | Todo, Todos, Todas (agree with the noun meant) | |
| Unknown | Desconocido | |
| Enabled / Disabled | Activado / Desactivado | Habilitado / Deshabilitado |
| On / Off | Activado / Desactivado | Encendido / Apagado (for a setting) |
| Turn on / Turn off | Activar / Desactivar | Encender (for a setting) |
| Automatic | Automático | Auto (except as a value in a tight picker) |
| Custom | Personalizado | Custom |
| Default | Predeterminado, por defecto | Por default |
| Default (a track flag) | Predeterminada (the track) | Defecto |
| Optional | Opcional | Facultativo |
| Required | Obligatorio | Requerido |
| Required (a form field) | Este campo es obligatorio | Campo requerido |
| Use at least 8 characters, 8+ characters | Mínimo 8 caracteres | Usa al menos 8 caracteres, 8+ caracteres |
| e.g. | p. ej. | ej., e.g. |
| Loading | Cargando… | Loading |
| Error | Error | Fallo |
| Warning | Advertencia | Warning |
| Success | Listo, or the result itself | Éxito |
| Failed (a status) | Error | Fallido, Falló |
| Mute (the button) / Muted | Silenciar / Silenciado | Mutear, Mudo |
| Volume | Volumen | |
| Fullscreen | Pantalla completa | |
| Exit fullscreen | Salir de pantalla completa | |
| Picture in picture | Imagen en imagen | PiP alone |
| Playback speed | Velocidad de reproducción | |
| Aspect ratio | Relación de aspecto | Ratio |
| Subtitle delay | Retraso de los subtítulos | Delay |
| Sync | sincronizar, sincronización | sincronizar (fine), sync |
| Controls (of the player) | controles | mandos |
| Timeline, scrub bar | barra de progreso | timeline, línea de tiempo |
| Seek, jump | avanzar, retroceder, ir a | buscar (which is Search) |
| Storyboard (seek previews) | miniaturas de vista previa | storyboard |
| Intro and credits detection | detección de intros y créditos | |
| Theme song (of a series) | sintonía | canción del tema |
| Bandwidth | ancho de banda | |
| Port | puerto | |
| Port forwarding | redirección de puertos | reenvío de puertos, abrir puertos |
| Host | host | anfitrión |
| Certificate | certificado | |
| Firewall | cortafuegos | firewall |
| Torrent | torrent | |
| Seeders / Peers | semillas / pares | seeders, peers |
| Seeding (a torrent) | Compartiendo | Sembrando, Seedeando |
| The swarm | los pares | el enjambre, swarm |
| Indexer | indexador | indexer |
| Usenet | Usenet | |
| Webhook | webhook | |
| Cache | caché | cache |
| Snapshot | instantánea | snapshot |
| Migration | migración | |
| Scan (a library) | escanear, escaneo | scanear, analizar (Plex and Jellyfin write *escanear*) |
| Metadata | metadatos | metadata |
| Match (a title) | identificar, identificación | matchear, emparejar |
| Fix the match, Rematch | Corregir la identificación | Corregir coincidencia |
| Ready to watch (a notification) | Disponible | Listo para ver |
| {title} was added | Nuevo en la biblioteca: {title} | {title} ha sido añadido, whose gender a title does not tell |
| Kill switch | corte de emergencia | kill switch |
| Uptime | Activo desde hace {duración} | Uptime, Tiempo de actividad |
| Last year (a time range) | Últimos 12 meses | El año pasado |
| Top users | Usuarios más activos | Top usuarios |
| Critically acclaimed (a row of movies and series) | Aclamados por la crítica; *Aclamado por la crítica* on one title | Aclamado críticamente |
| A-Z (a sort) | De la A a la Z | A-Z |
| Most recent, newest | Más recientes | Lo más nuevo |
| AI suggestions | Sugerencias de IA | Sugerencias AI |
| Invite a user | Invitar a alguien | Invitar a un usuario |
| Logs | registros | logs |
| Blocklist | lista de bloqueo | lista negra |
| Supervise (a process) | supervisar | |
| Media items (a count) | títulos | medios, ítems, elementos |
| Item (a generic thing in a list) | elemento | ítem, item |
| Feature | función | feature, característica |
| LAN address | dirección en la red local | dirección LAN |
| Local network | red local | LAN |
| Roku (the device) | dispositivo Roku | los Roku |
| At any time | en cualquier momento | |
| Sign in failed | No se ha podido iniciar sesión | Error de inicio de sesión, Fallo al iniciar sesión |
| Invalid credentials | Usuario o contraseña incorrectos | Credenciales inválidas |
| Link a device, Quick Connect | Vincular un dispositivo, Conexión rápida | Enlazar un dispositivo |
| Has already been used (a link, a code) | ya se ha usado | ya ha sido utilizado |
| Expired | ha caducado | ha expirado |
| 3 of 10, 3/10 | 3 de 10 | 3 / 10 |
| 1-50 of 200 (a page) | 1-50 de 200 | 1-50 / 200 |
| S1E3 (the compact chip) | T1:E3 | S1E3, Temporada 1 Episodio 3 |
| Text subtitles | subtítulos de texto | |
| Image subtitles (PGS, VobSub) | subtítulos de imagen | subtítulos bitmap |
| Burn in (subtitles) | incrustar | quemar |
| Remuxed, repackaged | reempaquetado sobre la marcha | remuxeado |
| Language (of the interface) | idioma | lenguaje |
| Household | hogar | casa, familia (unless the source says family) |
| Kids (a profile) | Infantil | Niños, Kids |
| Maturity, parental controls | control parental, clasificación por edades | madurez |
| Rated {label} | Clasificación: {label} | Calificado {label} |
| All ages (a rating) | Todos los públicos | Para todos, Todo público |
| Report (a problem), to report | informe, informar de un problema | reporte, denuncia, reportar |
| Crash report | informe de fallos | reporte de crash |
| Something went wrong | Algo ha fallado | Algo salió mal, Ups |
| Not found (an error) | No se encuentra el / la … | … no encontrado (except the 404 title: *Página no encontrada*) |
| Forgot your password? Forgot your PIN? | ¿No recuerdas la contraseña?, ¿No recuerdas el PIN? | ¿Olvidaste…?, ¿Has olvidado…? (each reads as one side's) |
| Reload (a page) | Volver a cargar | Recargar, Refrescar |
| Sign-in provider | proveedor de inicio de sesión | proveedor de identidad (unless the source says identity) |
| Signed in (a device) | con la sesión iniciada | logueado, conectado |
| Password strength | Débil, Aceptable, Buena, Fuerte | Media, Excelente |
| Trending | Tendencias (a row), en tendencia (an adjective), Tendencia (a note) | Trending, Populares |
| Featured | Destacados | Presentados |
| Up next | A continuación | Siguiente (which is Next) |
| New (a note on a title) | Novedad | Nuevo, New |
| Skip recap | Saltar resumen | Omitir recapitulación |
| Ends at {time} | Termina a las {time} | Acaba, Fin a las |
| Stop casting | Dejar de transmitir | Parar de castear |
| Play on TV, Move to TV | Reproducir en el televisor, Pasar al televisor | Castear, Enviar a la TV |
| Theme music (on a title page) | música | sintonía (which is the series' opening song) |
| Night mode (audio) | Modo nocturno | Modo noche |
| Boost (audio) | Amplificación, Amplificar | Boost, Potenciar |
| Subtitle edge (Android's words) | Ninguno, Elevado, Hundido, Uniforme, Sombra | Levantado, Deprimido |
| Font families | Con serifa, Sin serifa, Monoespaciada, Versalitas, Cursiva, Informal | Serif, Sans-serif, Mono |
| Original version, subtitled (a trailer) | VO, subtitulado | VOSE (Spain only) |
| Discover (a section of search results) | Por descubrir | Descubrir |
| Known for (a person) | Trabajos más conocidos | Conocido por, Conocida por |
| A person's role (Actor, Director, Writer, Creator) | the function, which has no gender: *Interpretación*, *Dirección*, *Guion*, *Creación* | Actor, Director, Guionista, Creador |
| Department (TMDB) | Interpretación, Dirección, Guion, Producción, Sonido, Cámara | Actuación, Escritura |
| Night, date night (a theme row) | Noche en pareja | Noche de cita |
| Relay (kroma.tv's mail relay) | el servicio de envío de kroma.tv, el servicio de envío | el relé, el relay |
| Monitor, follow (a title the acquisition watches) | Seguir; Dejar de seguir; *seguido* as an adjective (*títulos seguidos*); *en seguimiento* as a state (*está en seguimiento*) | monitorizar, monitorear, rastrear |
| Preset | preajuste | preset, ajuste predefinido |
| Missing (episodes; the view, a column) | Faltantes; in a sentence *los que faltan* | Perdidos, Ausentes |
| On the way (a grabbed release) | En camino | Agarrado, Obtenido |
| To air, upcoming | Por emitir; *Próximamente* for a tab | A emitir |
| Undo | Deshacer | Anular |
| Deselect all | Anular la selección | Deseleccionar todo |
| Tablet | tablet | tableta |
| Computer (a device type, alone in a list) | Equipo | Ordenador, Computadora |
| Extended access (a module) | acceso ampliado | acceso extendido |
| Whoever publishes it (a module) | quien lo publica | su editor |
| VPN | la VPN (feminine: *la red privada*) | el VPN |
| Embedding, embedding model | vector de contenido; *modelo de embeddings* | incrustación |
| Fingerprint (a detection mode) | huella digital; *huella del audio* | fingerprint |
| Host updater | la herramienta de actualización del host | el actualizador |
| LLM | el LLM | el modelo grande de lenguaje |
| Release status of a title (Planned, Released, Ended…) | feminine, since *película* and *serie* both are: *Prevista*, *Estrenada*, *En emisión*, *Finalizada*, *Cancelada* | masculine forms |
| Acquisition (the module, the job category) | Adquisición | Obtención, Captura |
| Grab (a release) | obtener | agarrar, coger, grabar |
| Upgrade (a better release) | mejora, una versión mejor | upgrade, actualización |
| Stalled (a download) | atascado | estancado, parado |
| Recycle bin | papelera | basura, reciclaje |
| Tracker (torrent) | tracker | rastreador |
| Feed (Torznab, RSS) | fuente | feed |
| Built-in | integrado | incorporado, nativo |
| Cron expression | expresión cron | |
| Branch, commit (git) | rama, commit | branch |
| Database | base de datos | base, BD, DB |
| Write-ahead log (SQLite) | registro de escritura anticipada | WAL alone, log |
| Priority, Prio (a short label) | Prioridad, Prior. | Prio |
| Scheduled (a job, a backup) | programado | agendado, planificado |
| Schedule (a job's) | programación | horario, calendario |
| Email (messages sent by the server) | correo, correos | mails, emails |
| Kids profile | perfil infantil | perfil de niños |
| Middleware (the request filter modules) | Módulos de filtrado | middleware |
| Route Direct (network) | Directa | Directo |
| Reports (problem reports: nav, notification category) | Informes; *Informes de problemas* where the category stands alone | Reportes |
| Clear cache, Clear PIN | Vaciar la caché, Quitar el PIN | Limpiar, Borrar |
| Allow (a button) | Permitir | Autorizar (which is Authorize) |
| Endpoint | punto de conexión | endpoint, extremo |
| Self-signed (a certificate) | autofirmado | auto-firmado |
| OIDC scope, claim, issuer | ámbito; *claim* and *issuer* stay | alcance, reclamación, emisor |
| Channel names Stable, Canary | stay raw: the UI prints them untranslated | Estable |
| Full scan (SQL) | recorrido completo | escaneo completo |
| Statement (SQL), query plan | instrucción, plan de la consulta | sentencia, plan de la petición |
| Pipeline stages: probe, storyboard, embedding | Archivo, Miniaturas, Vector de contenido | Sonda, Storyboard |
| Settled (a notification someone handled) | Resuelta, Resuelta por {user} | Arreglada |
| A toast about a title (the code passes `{title}`, `{stage}` or `{names}` into the message) | a whole sentence with the title in “ ”, and the participle agreeing with a noun that carries the gender, never with the title: *Solicitud de “{title}” aprobada*, *Informe sobre “{title}” resuelto*, *“{title}” está en seguimiento*, *Etapa {stage} reiniciada*, *Con error: {names}* | *“{title}” aprobada*, « » |
| Custom format, format score | formato personalizado, puntuación de formatos | formato custom |
| Quality ladder, a rung of it | escala de calidades, nivel | escalera, peldaño |
| Season pack | Temporada completa | pack de temporada |
| Release name | nombre de la versión | nombre del release |
| Indexer flag | marca del indexador | flag |
| Must / May / Must not (a rule) | Debe / Puede / No debe | Obligatorio / Opcional |
| Weight (how strict a rule is) | Exigencia | Peso |
| Naming tokens | Variables | tokens |
| Case (letter case) | Mayúsculas y minúsculas | Caso |
| Throughput (a transfer) | Velocidad; *Tasa de transferencia* in the player stats, where Speed is also shown | Rendimiento |
| Down / Up (transfer) | Descarga / Subida | Bajada |
| Media (the admin nav group), Sources (libraries) | Multimedia, Fuentes | Medios |
| Dashboard (a page-title suffix) | " · Panel" | Dashboard |
| Average | Promedio | Media (ambiguous next to media files) |
| Remux (a label) | Reempaquetado | Remux |
| Hardware acceleration, encoder, re-encode | aceleración por hardware, codificador, recodificar or *volver a codificar* | encoder, reencodear |
| Fallback (metadata) language | idioma de reserva | idioma alternativo, fallback |
| Played threshold | Umbral de visto | límite de reproducción |
| Join requests | Solicitudes de acceso | peticiones de unión |
| Import (nav), Bring a server over | Importación, Migrar desde otro servidor | Importar (as a noun) |
| Inert (a module) | Inactivo | Inerte |
| Local build | Compilación local | build local |
| Answers / Called by (a point) | Responde a / Lo llama | Contesta / Llamado por |
| WireGuard bridge | puente | bridge |
| Roku channel, Roku box | canal, dispositivo | caja |
| Self-hosted | autoalojado | self-hosted, auto-hospedado |
| Issue (GitHub) | incidencia | issue, problema |
| Journal (the blog's eyebrow) | Diario | Journal |

## Genres

`genre.*` must fold to TMDB's own Spanish names (TMDB `es-ES`), since KROMA
matches the genres a library stored against these labels. The fold drops
accents and case, so the spelling must be TMDB's word for word.

| TMDB id | English | Spanish |
|---|---|---|
| 28 | Action | Acción |
| 12 | Adventure | Aventura |
| 16 | Animation | Animación |
| 35 | Comedy | Comedia |
| 80 | Crime | Crimen |
| 99 | Documentary | Documental |
| 18 | Drama | Drama |
| 10751 | Family | Familia |
| 14 | Fantasy | Fantasía |
| 36 | History | Historia |
| 27 | Horror | Terror |
| 10402 | Music | Música |
| 9648 | Mystery | Misterio |
| 10749 | Romance | Romance |
| 878 | Science Fiction | Ciencia ficción |
| 10770 | TV Movie | Película de TV |
| 53 | Thriller | Suspense |
| 10752 | War | Bélica |
| 37 | Western | Western |

TMDB sends its TV genres in English to a Spanish reader (Action & Adventure,
Kids, News, Reality, Sci-Fi & Fantasy, Soap, Talk, War & Politics), and the
English label already matches those, so the Spanish label is our own: *Acción y
aventura*, *Infantil*, *Noticias*, *Telerrealidad*, *Ciencia ficción y
fantasía*, *Telenovela*, *Entrevistas*, *Guerra y política*.

## Word lists (`vocab.*`)

These are not shown: they are the words search and the synopsis splitter
recognise. List what a Spanish speaker types, accents included, colloquial forms
too: *película, peli, pelis*; *capítulo, cap*. Abbreviations are listed without
their full stop: *Sr, Sra, Dr, Dra*.

## Calques to avoid

| Written | Why it is wrong | Write |
|---|---|---|
| Tu biblioteca de medios, en casa | English possessive and word order | Tus películas y series, en casa |
| Saca más de tu biblioteca | *get more from* word for word | Aprovecha mejor tu biblioteca |
| Simplemente funciona | English *it just works* | Funciona sin configurar nada |
| El servidor escaneará tus archivos | a future where Spanish says what happens | El servidor escanea tus archivos |
| El archivo fue guardado exitosamente | English passive, and *successfully* is noise | Archivo guardado |
| Fallo al cargar la lista | *Failed to load* as a noun | No se ha podido cargar la lista |
| Ha ocurrido un error: archivo no encontrado | two messages glued with a colon | No se encuentra el archivo |
| Bienvenido de vuelta | *welcome back*, and gendered | Hola de nuevo |
| ¿Estás listo? | gendered adjective for the reader | ¿Empezamos? |
| Este dispositivo no sabe reproducir este formato | the device does a human thing | Este dispositivo no admite este formato |
| Remover de mi lista | *remove* as a false friend | Quitar de mi lista |
| Aplicación (on a button) | a noun where Spanish wants a verb | Aplicar |
| Por favor, introduce tu contraseña | *please* in an instruction | Introduce tu contraseña |
| Ingresa tu contraseña | *ingresar* reads as Latin American, and Spain reads it as *pay in* | Introduce tu contraseña |
| Tu perfil, tu lista, tus ajustes | a possessive on every noun, because English has one | Perfil, lista y ajustes |
| Eventualmente | *eventually* is a false friend: it means *possibly* | Con el tiempo, Al final |
| Actualmente (for *actually*) | false friend | En realidad |
| Aplicar a la selección, 3 elegidos | a comma for a count | Aplicar a la selección (3) |
| Mira la película + reanuda | a symbol for a word | Ver películas y series, y reanudar donde lo dejaste |
| En orden de llegar | word order | Por orden de llegada |
| El servidor está corriendo | *running* as *corriendo* | El servidor está en funcionamiento |
| Hace sentido | *makes sense* | Tiene sentido |
| Basado en tu historial (a row) | fine, but *En función de* is not: keep it plain | Según lo que has visto |
| Está siendo procesado | English progressive passive | Se está procesando |
| Sesión expirada, por favor vuelve a iniciar sesión | *please*, and a comma for a full stop | La sesión ha caducado. Vuelve a iniciar sesión. |

## Plurals

`todo` lists three CLDR categories for Spanish: `one`, `many` and `other`.

- Write the bare key as the general form (it is `other`) and `_one` for 1:
  *{count} temporadas* and *{count} temporada*.
- Skip `_many`: CLDR uses it for round millions in compact notation (*1 millón
  de…*), which this product never prints. The bare key covers it.
- Write `_zero` only where the source has one and a zero sentence reads better:
  *Ningún resultado*.
- Agreement follows the noun: *1 película vista*, *3 películas vistas*.

## Gender

Spanish has no neutral article for a placeholder, so a sentence must not need
to know the gender of `{title}`, `{name}` or `{user}`.

- Put the placeholder after a noun that carries the gender: *La película
  {title}* is wrong when it may be a series; write *Nuevo en la biblioteca:
  {title}*, *Ya puedes ver {title}*.
- For a person, use a verb with no participle: *{user} ha iniciado sesión*, not
  *{user} está conectado*.
- A generic masculine plural for people (*usuarios*, *administradores*) is what
  Spanish software writes; prefer *personas* where the sentence allows it.

## One screen, one thing to know

Spanish makes a long English hint longer still. Keep the one fact the reader
needs to act now, and move the rest to the screen where it matters.

## Turns that make Spanish sound Spanish

- *Donde lo dejaste* for *where you left off*.
- *Ya puedes* + infinitive for *you can now*: *Ya puedes ver la película.*
- *No hace falta* + infinitive for *you do not need to*.
- *Solo* without an accent (RAE 2010) for *only*.
- A *se* impersonal where English uses a passive or *we*: *Se ha enviado el
  enlace*, *Se necesita una conexión a internet*.
- *Internet* lowercase in a sentence when it is the network: *conexión a
  internet*.
- *Aún no* or *Todavía no* for *not yet*; *Ya no* for *no longer*.
