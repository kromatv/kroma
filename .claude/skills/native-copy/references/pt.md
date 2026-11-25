# Brazilian Portuguese

What Brazilian software says, and how. Read it before you write a `pt` string.
`pt` is Brazilian Portuguese, as it is in CLDR, FormatJS and Apple's
localizations, so write Brazil's Portuguese, never Portugal's (*ecrã*,
*ficheiro*, *utilizador*, *telemóvel*, *transferir*, *registar* are all wrong
here). A reader whose system says `pt-BR` or `pt-PT` is matched to `pt`. A
`pt-PT` catalog, when there is one, holds only what Portugal says differently
and reads everything else from `pt`.

## Register

- **Você**, implied. Netflix Brasil, Disney+, Prime Video, YouTube, Spotify,
  Google and Apple all address the reader as *você*, and almost never write the
  pronoun: the verb carries it. *Escolha um perfil*, not *Você deve escolher um
  perfil*. Write *você* only where the sentence needs a subject (*Você pode
  mudar isso depois*) and never *tu*, never *o senhor*, never *vocês* for one
  reader.
- Instructions are the **imperative of você**: *Selecione*, *Digite*, *Toque*,
  *Escolha*, *Verifique*, *Tente novamente*. Never the infinitive as an
  instruction in a sentence (*Verificar a conexão.* is a button, not a hint).
- Warm and plain. No *por favor* in every sentence, no *favor* + infinitive, no
  *gentileza*, no *a fim de*. Google's and Netflix's Brazilian copy is short and
  friendly.
- The product does not say *nós* about itself. Say *o KROMA*.
- **KROMA is masculine** (*o KROMA*, *do KROMA*, *no KROMA*, *ao KROMA*), as a
  Brazilian says *o aplicativo*, *o servidor*. A product name alone on a screen
  takes no article.
- **The reader has no grammatical gender.** Avoid an adjective or participle
  about the person (*Você está conectado*, *Bem-vindo*): say the state of the
  thing instead (*Conexão feita*, *Sessão encerrada*, *Que bom ter você aqui*,
  *Boas-vindas*). Generic masculine is the last resort for a role noun
  (*usuário*, *administrador*), as every Brazilian OS does.
- **A title has no known gender either.** *{title} foi adicionado* fails for
  *a série*. Put the title after a colon, or make the sentence about the
  library: *Novo na biblioteca: {title}*.
- Fewer possessives than English. *Verifique a conexão*, not *Verifique sua
  conexão de rede*. Keep *seu / sua* where it says whose (*Sua lista*,
  *seu servidor*), not on every noun.

## The form of each kind of string

| Kind | Form | Example |
|---|---|---|
| Button | infinitive | *Salvar*, *Continuar*, *Assistir*, *Tentar novamente* |
| Button that speaks for the reader | infinitive + *meu / minha* | *Criar minha conta*, *Abrir minha biblioteca* |
| Menu item, tab | noun or infinitive | *Início*, *Buscar*, *Minha lista*, *Configurações* |
| Screen title | noun phrase, or a question | *Quem está assistindo?*, *Configurações da conta*, *Sair do KROMA?* |
| Work in progress | gerund + `…` | *Carregando…*, *Instalando…*, *Salvando…* |
| Result | participle, agreeing with the thing | *Salvo*, *Link copiado*, *Conta criada* |
| Error | *Não foi possível* + infinitive, then what to do | *Não foi possível conectar ao servidor. Verifique a rede e tente novamente.* |
| Empty state | what is true, then the way out | *Nenhum título ainda. Adicione uma pasta de mídia para começar.* |
| Hint | a full sentence with its full stop | *Cada pasta vira uma biblioteca.* |
| Count | number + noun | *3 temporadas*, *1 episódio*, *10 s* |

*Não foi possível* + infinitive is what Google, Apple and Microsoft write in
Brazil; it is not a calque here. Never *Falha ao* + infinitive as a sentence,
never *Erro ao* + infinitive as a whole message: they are status labels.

## Typography

- No space before `.` `,` `:` `;` `!` `?` `%`; one space after. (Unlike French.)
- One character for the ellipsis: `…`.
- Quotation marks: `“ ”`, and `‘ ’` inside them.
- Sentence case, in titles and buttons too: *Configurações da conta*, not
  *Configurações da Conta*. Months and weekdays are lowercase (*25 de novembro*,
  *segunda-feira*). Language names are lowercase in a sentence (*em inglês*) and
  capitalised when they stand alone as a list label (*Inglês*, *Português
  (Brasil)*).
- Decimal comma, dot for thousands: *1,5 GB*, *1.200 títulos*. Units keep their
  English symbols in Brazil: *KB*, *MB*, *GB*, *TB* (never *Ko*, *Go*).
  `Intl` writes them; write them the same way in a message.
- A space between a number and its unit: *10 s*, *5 min*, *2 h*, *30 MB*,
  *20 Mbps*. Durations: *1 h 52 min*.
- *Mbps* for a bitrate: it is what every Brazilian provider and router writes.
  Not *Mb/s*, not *Mbit/s*.
- A word, not a symbol: *e*, *ou*. Not `+`, not `/`, not `&` (except inside a
  TMDB genre name).
- *e-mail* with a hyphen, lowercase in a sentence (*E-mail* at the start).
- Season and episode in a compact chip: *T1:E3* (Netflix Brasil). In a
  sentence: *Temporada 1, episódio 3*.
- Latin and unchanged: KROMA, TMDB, Tizen, webOS, Roku, Samsung, LG, Docker,
  Synology, GitHub, Plex, Jellyfin, Emby, Chromecast, AirPlay; codecs and formats
  HEVC, H.264, H.265, AV1, VP9, AAC, AC-3, E-AC-3, DTS, TrueHD, Atmos, HDR, HDR10,
  Dolby Vision, SDR, 4K, HLS, SRT, ASS, PGS, NZB, RSS, VPN, SSO, SQL, PIN, QR code.
- Keep every `{placeholder}` exactly as the source spells it, including repeats.
- Keep markup exactly: `[KROMA]`, `*Settings*`, backticks, Markdown, HTML, URLs,
  `$t(...)`.
- No comma before the *e* or the *ou* that ends a list.

## Fixed vocabulary

| English | Brazilian Portuguese | Never |
|---|---|---|
| Settings | Configurações | Ajustes (iOS only), Definições (pt-PT) |
| Library | Biblioteca | Mediateca, Acervo |
| Media library | biblioteca de mídia | média (pt-PT) |
| Media (your files) | seus filmes e séries, mídia | médias, os media |
| Movie | Filme | Película |
| Series, show | Série | Programa (unless the source says show for TV talk) |
| Season | Temporada | Época (pt-PT) |
| Episode | Episódio | Capítulo |
| Title (a movie or series) | título | conteúdo (for one item) |
| Content | conteúdo | |
| Media items (a count) | títulos | mídias |
| Play (the button that starts a title) | Assistir | Jogar, Tocar |
| Play (the player control, the verb) | Reproduzir | Rodar, Tocar |
| Playback | reprodução | execução |
| Resume (a button) | Continuar | Resumir, Retomar |
| Continue Watching (the row) | Continuar assistindo | Continuar a ver |
| Start over | Começar do início | Reiniciar |
| Pause | Pausar | Parar |
| Stop | Parar | |
| Skip intro | Pular abertura | Saltar introdução |
| Skip recap | Pular recapitulação | |
| Skip credits | Pular créditos | |
| Next episode | Próximo episódio | Episódio seguinte |
| Up next | A seguir | Próximo |
| Subtitle | Legenda | Subtítulo |
| Subtitles off | Desativadas (legendas), Sem legendas | Desligado |
| Audio | Áudio | Som (except for volume) |
| Audio & subtitles | Áudio e legendas | |
| Dub, dubbed | Dublagem, dublado | Dobragem (pt-PT) |
| Original audio | Áudio original | |
| Forced subtitles | Legendas forçadas | |
| SDH, closed captions | Legendas descritivas, [CC] | Closed caption alone |
| Audio description | Audiodescrição | Descrição de áudio |
| Quality | Qualidade | |
| Resolution | Resolução | |
| Bitrate | Taxa de bits | Bitrate |
| Codec | Codec | Codificador (for the format name) |
| Transcode, transcoding | Transcodificar, transcodificação | Converter (unless the source says convert) |
| Direct play | Reprodução direta | Play direto |
| Stream, streaming | streaming, transmissão | stream (as a noun in a sentence) |
| Buffering | Carregando | Armazenando em buffer, Bufferizando |
| Server | Servidor | |
| Client | Cliente | |
| Profile | Perfil | |
| Kids profile | Perfil infantil | Perfil de criança |
| Who's watching? | Quem está assistindo? | Quem está vendo? |
| Account | Conta | |
| User | Usuário | Utilizador (pt-PT) |
| Username | Nome de usuário | Login |
| Administrator, admin | Administrador | Admin |
| Admin (the area) | Administração | Admin, Painel admin |
| ADMIN (the badge on the admin rail, all capitals, little room) | ADMIN | ADMINISTRAÇÃO |
| Owner | Proprietário | Dono |
| Home | Início | Home, Casa, Página inicial (on a tab) |
| Search (the tab, the action) | Buscar | Procurar, Pesquisar |
| Search (the noun) | busca | pesquisa |
| Discover (the page) | Explorar | Descobrir |
| Browse | Navegar | Procurar |
| My list | Minha lista | Lista de desejos, Watchlist |
| Add to My list | Adicionar à Minha lista | Adicionar à lista de favoritos |
| Favorites | Favoritos | |
| Request (a title) | Pedido, pedir | Requisição, requerimento |
| My requests | Meus pedidos | Minhas requisições |
| Download (the verb) | Baixar | Transferir (pt-PT), Fazer download |
| Downloads (the noun) | Downloads | Transferências |
| Upload | Enviar | Carregar, Upar, Fazer upload |
| Folder | Pasta | Diretório (unless the source says directory) |
| File | Arquivo | Ficheiro (pt-PT) |
| Path | Caminho | |
| Storage | Armazenamento | Storage |
| Screen | Tela | Ecrã (pt-PT) |
| Phone | Celular | Telemóvel (pt-PT), Smartphone |
| TV (the device) | TV, feminine (*a TV*, *sua TV*) | o TV, televisor |
| Television (a kind of device) | TV | televisão (the medium) |
| Remote (control) | Controle remoto | Comando |
| Device | Dispositivo | Aparelho (except in a casual hint) |
| Network | Rede | |
| Same network | mesma rede | |
| LAN address | endereço na rede local | endereço LAN |
| Remote access | Acesso remoto | Acesso à distância |
| Connection | Conexão | Ligação (pt-PT) |
| Connect | Conectar | Ligar (pt-PT) |
| Sign in | Entrar | Logar, Fazer login (on a button), Iniciar sessão |
| Sign out | Sair | Deslogar, Fazer logout |
| Sign out (another device, a session) | Desconectar | Sair (which says the reader leaves) |
| Sign-in (the noun), sign-in screen | login, tela de login, provedores de login | logon, acesso (for the screen) |
| Sign up | Criar conta, Cadastrar-se | Registar-se (pt-PT), Inscrever-se |
| You are signed out (a state) | Sessão encerrada | Você foi desconectado |
| Sign in failed | Não foi possível entrar | Falha no login |
| Invalid credentials | Usuário ou senha incorretos | Credenciais inválidas |
| Password | Senha | Palavra-passe (pt-PT), Password |
| Passkey | Chave de acesso | Passkey |
| PIN | PIN, masculine (*o PIN*) | código PIN (once the PIN is named) |
| One-time code | Código de uso único | Código OTP |
| Two-factor authentication | Autenticação de dois fatores | 2FA alone |
| Recovery code | Código de recuperação | |
| Email | e-mail | email, mail, correio eletrônico |
| Invitation | Convite | |
| Invitation link | Link de convite | |
| Invite a user | Convidar alguém | Convidar um usuário |
| Link / Unlink (a sign-in provider) | Vincular / Desvincular | Linkar, Associar |
| Link a device, Quick Connect | Conectar um dispositivo, Conexão rápida | Linkar dispositivo |
| Pair (a remote, a TV) | Parear | Emparelhar (pt-PT) |
| Permission | Permissão | |
| Rights (what a user may do) | Permissões | Direitos |
| Module | Módulo | |
| Plugin | Plug-in | Plugin, Extensão |
| Feature | Recurso | Funcionalidade, Feature |
| Job, task | Tarefa | Job, Trabalho |
| Queue | Fila | |
| Queued (a stage) | Na fila | Enfileirado |
| Pipeline | Processamento | Pipeline |
| Backup | Backup | Cópia de segurança (except once, to explain it) |
| Restore | Restaurar | Repor |
| Update (noun / verb) | Atualização / Atualizar | Update |
| Update available | Atualização disponível | Nova versão |
| Release (a software release) | Versão | Release, Lançamento |
| Release (a torrent or an NZB) | versão | release |
| Release date | Data de lançamento | |
| Version | Versão | |
| Build | build | compilação |
| Release channel | Canal de atualização | |
| Genre | Gênero | Género (pt-PT) |
| Director | Direção (a credit line), Diretor | Realizador (pt-PT) |
| Created by | Criação | Criado por |
| Cast | Elenco | Cast |
| Actor | Ator, atriz | |
| Crew | Equipe técnica | Equipa (pt-PT) |
| Rating (a score) | Avaliação, nota | Rating |
| Age rating, maturity rating | Classificação indicativa | Classificação etária |
| Runtime | Duração | Tempo de execução |
| Overview, synopsis | Sinopse | Visão geral, Resumo |
| Trailer | Trailer | Reboque, Prévia |
| Extras (bonus material) | Extras | Bônus |
| More like this | Títulos semelhantes | Mais como este |
| Collection | Coleção | |
| Recently added | Adicionados recentemente | Recém-adicionados |
| Trending | Em alta | Tendências, Trending |
| Popular | Populares | |
| Top rated | Mais bem avaliados | Melhor avaliados |
| Coming soon | Em breve | |
| Critically acclaimed | Aclamados pela crítica | Aclamados criticamente |
| Artwork | Imagens | Artwork, Arte (alone) |
| Poster | Pôster | Cartaz |
| Backdrop | Imagem de fundo | Backdrop, Pano de fundo |
| Thumbnail | Miniatura | Thumb, Thumbnail |
| Logo | Logo | Logótipo (pt-PT) |
| Theme | Tema | |
| Appearance | Aparência | |
| Dark / Light | Escuro / Claro | |
| Session | Sessão | |
| Token | Token | |
| Log, logs | log, logs | registro (unless the source says record) |
| Error | Erro | |
| Warning | Aviso | Alerta (except a real alert) |
| Success | Concluído | Sucesso |
| Failed | Falhou, com falha | Fracassou |
| Loading | Carregando… | A carregar (pt-PT) |
| Retry | Tentar novamente | Repetir |
| None | Nenhum / Nenhuma | Nada (for a setting) |
| All | Todos / Todas / Tudo | |
| Unknown | Desconhecido | |
| Enabled / Disabled | Ativado / Desativado | Habilitado / Desabilitado |
| On / Off (a toggle) | Ativado / Desativado | Ligado / Desligado, On / Off |
| Turn on / Turn off | Ativar / Desativar | Ligar / Desligar (except a device) |
| Automatic | Automático | Auto (except where it is the setting's value on a chip) |
| Custom | Personalizado | Customizado |
| Default | Padrão | Default |
| Default (a track flag) | Padrão | |
| Optional | Opcional | Facultativo |
| Required (a form field) | Obrigatório | Requerido |
| e.g. | Ex.: | p. ex. |
| Save | Salvar | Guardar (pt-PT), Gravar |
| Cancel | Cancelar | |
| Delete | Excluir | Apagar, Deletar |
| Remove (from a list) | Remover | Excluir (when nothing is destroyed) |
| Clear (a field, a search, a history) | Limpar | Apagar, Esvaziar |
| Edit | Editar | |
| Add | Adicionar | |
| Create | Criar | |
| Apply | Aplicar | |
| Reset | Redefinir | Resetar |
| Confirm | Confirmar | |
| Continue | Continuar | Prosseguir |
| Next (a wizard step) | Avançar | Seguinte (pt-PT), Próximo |
| Back | Voltar | Retroceder |
| Close | Fechar | |
| Done (a button that closes a step) | Concluído | Feito, Pronto |
| OK | OK | Ok |
| Skip (a step) | Pular | Saltar (pt-PT), Ignorar |
| Set up, setup | Configurar, configuração | Setup, Instalar |
| Learn more | Saiba mais | Aprenda mais |
| Copy / Copied | Copiar / Copiado | |
| Share | Compartilhar | Partilhar (pt-PT) |
| Tap (on a phone) | Toque em | Clique (on a phone), Aperte |
| Click (on a computer) | Clique em | |
| Press (a remote button) | Pressione | Aperte, Prima (pt-PT) |
| Select (a choice) | Selecionar, escolher | |
| Scan (a QR code) | Escaneie, leia | Digitalize |
| Scan (a library) | Analisar, análise | Escanear, Varrer, Scan |
| Probing (a file) | leitura dos arquivos | sondagem, probing |
| Match (a title) | Identificar, identificação | Combinar, dar match |
| Fix the match | Corrigir identificação | Corrigir correspondência |
| Rematch | Identificar de novo | Rematch |
| Metadata | Metadados | Metadata |
| Mute / Unmute | Desativar som / Ativar som | Mudo, Silenciar |
| Muted (the volume) | Sem som | Mudo |
| Volume | Volume | |
| Fullscreen | Tela cheia | Ecrã inteiro (pt-PT) |
| Exit fullscreen | Sair da tela cheia | |
| Picture in picture | Picture-in-picture | Imagem na imagem |
| Playback speed | Velocidade de reprodução, Velocidade | |
| Aspect ratio | Proporção | Razão de aspecto |
| Audio track | Faixa de áudio | Pista de áudio |
| Subtitle delay | Atraso da legenda | Delay |
| Sync | Sincronizar, sincronia | Sync |
| Controls (of the player) | Controles | Comandos |
| Timeline, scrub bar | barra de progresso | timeline, linha do tempo |
| Storyboard (seek previews) | miniaturas de prévia | storyboard |
| Intro and credits detection | detecção de abertura e créditos | detecção de intro |
| Theme song (of a series) | música de abertura | música-tema |
| Watched / Unwatched | Assistido / Não assistido | Visto |
| Mark as watched | Marcar como assistido | |
| Ready to watch (a notification) | Disponível para assistir | Pronto para assistir |
| Bandwidth | Largura de banda | Banda |
| Port | Porta | |
| Host | Host | Anfitrião |
| Port forwarding | Redirecionamento de porta | Abertura de porta |
| Certificate | Certificado | |
| Firewall | Firewall | |
| Cache | Cache | |
| Snapshot | Snapshot | Instantâneo |
| Migration | Migração | |
| Kill switch | kill switch | interruptor de emergência |
| Uptime | Ativo há {duration} | Uptime, Disponibilidade |
| Last year (a time range) | Últimos 12 meses | Ano passado |
| Top users | Usuários mais ativos | Top usuários |
| Mb/s | Mbps | Mb/s, Mbit/s |
| 3 of 10, 3/10 | 3 de 10 | 3 / 10 |
| 1-50 of 200 (a page) | 1 a 50 de 200 | 1-50 / 200 |
| S1E3, Play S1E3 | T1:E3, Assistir T1:E3 | S1E3 |
| Text subtitles | legendas em texto | legendas texto |
| Remuxed, repackaged | contêiner adaptado na hora | remuxado |
| Torrent | torrent | |
| Seeder / Peer | Semeador / Par | Seeder, Peer |
| Seeding (a torrent) | Semeando | Seeding |
| The swarm | os pares | o swarm, o enxame |
| Indexer | Indexador | Indexer |
| Usenet | Usenet | |
| Webhook | Webhook | |
| Blocklist | Lista de bloqueio | Lista negra, Blacklist |
| Supervise (a process) | monitorar | supervisionar |
| Acquisition (the admin page) | Aquisição de conteúdo | Aquisição alone |
| QR (to scan) | QR code | código QR, QR |
| Roku (the device) | aparelho Roku | os Rokus |
| At any time | a qualquer momento | quando quiser (in a hint is fine) |
| AI suggestions | Sugestões da IA | Sugestões IA |
| A-Z, Title A-Z (a sort) | Ordem alfabética | A-Z, Título A-Z |
| 8+ characters, use at least 8 characters | No mínimo 8 caracteres | 8+ caracteres, Use pelo menos 8 caracteres |
| Has already been used (a link, a code) | já foi usado | já foi utilizado |
| Language (a setting) | Idioma | Língua |

## Terms fixed while translating

| English | Brazilian Portuguese | Never |
|---|---|---|
| Ready (a cast device, idle) | Disponível | Pronto, Pronta (gendered) |
| Monitor, follow (a title, a season, an episode) | Monitorar, monitorado, Parar de monitorar | Seguir, Acompanhar (one verb for both English words) |
| Missing (episodes, a tab, a state) | Faltando, os que faltam | Ausente, Em falta (pt-PT) |
| Upcoming, to air | Em breve, ainda vai ao ar | A exibir |
| To improve (upgrades tab) | A melhorar | Upgrades |
| On the way (grabbed) | A caminho | Capturado |
| Preset (of monitored episodes) | predefinição | preset |
| Grab (a release) | baixar | pegar, capturar |
| Tracker | tracker, trackers | rastreador |
| Relay (the kroma.tv mail relay) | o relay do kroma.tv | retransmissor, relé |
| Registry (of modules) | registro, registro oficial | repositório (that is a code repository) |
| Extended access (a module) | acesso ampliado | acesso estendido |
| Isolated (a module) | Isolado | Sandboxed |
| Whoever publishes it (a module) | quem o publica | o editor |
| Embedding (recommendations) | embedding, embeddings | incorporação, vetorização |
| LLM | LLM | |
| Fingerprint (the intro detection mode) | fingerprint (the mode's name), impressão digital do áudio (in a sentence) | |
| Loudness | volume percebido (EBU R128) | loudness, sonoridade |
| Host updater | o atualizador do host, o atualizador | a ferramenta de atualização do host (too long for the admin screens that repeat it) |
| Recycle bin | lixeira | reciclagem |
| Hash (of a PIN) | hash | impressão digital |
| Open in a new tab | Abrir em nova guia | Abrir em nova aba |
| Tab (in the app: *the Discover tab*) | guia (*a guia Explorar*) | aba (one word for every tab) |
| Run (a job) / Running | Executar / Em execução, Executando… | Rodar (on a button) |
| Job status: cancelled, failed, succeeded | Cancelada, Falhou, Concluída (*a execução*) | |
| Status of a series: Returning, Ended, Canceled | Em exibição, Encerrada, Cancelada (*a série*) | |
| Off (a TV on the cast list) | Desligada | Desligado (*a TV*) |
| Took the remote | pegou o controle | assumiu o controle remoto |
| Input source (of a TV) | entrada | fonte |
| Back (the remote key, in a hint) | *Pressione Voltar para…* | Voltar para voltar |
| Online / Offline | On-line / Off-line | Online, Offline |
| App | app (masculine, *o app*) | aplicativo on a short label; aplicação (pt-PT) |
| New (a badge on a title) | Novidade | Novo / Nova (the title's gender is unknown) |
| Acclaimed (a badge on a title) | Sucesso de crítica | Aclamado |
| Added to / removed from My list (a toast) | Agora na Minha lista / Saiu da Minha lista | Adicionado, Removido (gendered) |
| Don't miss (a row) | Imperdíveis | Não perca |
| Feel-good (a row) | Para levantar o astral | Feel-good |
| Mind-benders (a row) | De dar nó na cabeça | Alucinantes |
| Edge of your seat (a row) | De roer as unhas | Na ponta da cadeira |
| Bring the tissues (a row) | Separe os lenços | Traga os lenços |
| Date night (a row) | Para assistir a dois | Noite de encontro |
| Based on a true story | Baseado em fatos reais | Baseado em uma história verdadeira |
| All ages (a maturity level) | Livre | Todas as idades, L |
| Rated {label} | Classificação: {label} | Classificado {label} |
| Actor {n} (a form field) | Pessoa {n} | Ator {n} (gendered) |
| Role (of an actor) | Personagem | Papel (on a placeholder) |
| Acting, Directing, Writing, Creator (a credit) | Atuação, Direção, Roteiro, Criação | Ator, Diretor, Roteirista, Criador (gendered) |
| Known for | Trabalhos mais conhecidos | Conhecido por (gendered) |
| Died | Falecimento | Morte |
| Tagline | Slogan | Tagline |
| Summary (a title's) | Sinopse | Resumo |
| Sort title | Título para ordenação | Título de ordenação |
| Report (a problem a user reports) | relato, relatar um problema | denúncia, report |
| Request (HTTP, technical) | requisição | pedido (which is a title request) |
| Video stream (a track of the file) | faixa de vídeo | stream, fluxo |
| Stream (playback refused, failed) | reprodução, transmissão | stream |
| Boost (an audio filter), volume boost | Amplificação, Amplificação de volume | Boost, Reforço |
| Night mode | Modo noturno | Modo noite |
| High dynamics (a loudness verdict) | Volume muito variável | Alta dinâmica |
| Quiet dialogue | Diálogos baixos | Diálogo silencioso |
| Small capitals (a subtitle font) | Versalete | Maiúsculas pequenas |
| Raised / Depressed (a subtitle edge) | Em relevo / Em baixo-relevo | Elevado / Deprimido |
| Fill screen / Fit to screen | Preencher a tela / Ajustar à tela | |
| Slideshow (the home hero) | apresentação | slideshow, carrossel |
| Built (a build date) | Data do build | Construído |
| Commit | Commit | |
| Media details (the file's codecs) | Detalhes do arquivo | Detalhes da mídia |
| Container (a file format) | Contêiner | Container |
| Keyboard layout | Layout do teclado | Disposição do teclado |
| Performance overlay | Painel de desempenho | HUD |
| Who's watching? | Quem está assistindo? | |
| Remote (the device that drives a TV) | controle remoto, controle | comando |
| Speak now (voice search) | Fale agora… | Pode falar |
| Report a problem | Relatar um problema | Reportar |
| Requested (a toast, with the title) | Pedido feito: “{title}” | {title} pedido (gendered) |
| Playback engine | Mecanismo de reprodução; each engine is a *player*: Player da Samsung, Player mpv, Player VLC, Player do navegador, Shaka Player | Motor, Reprodutor |
| Remux (an engine, a state) | Contêiner adaptado pelo servidor, contêiner adaptado na hora | Remux, Remuxar |
| Job (a background task) | tarefa; one run of it is *a execução* | job, trabalho |
| Requests (HTTP, the performance tab) | Requisições, Requisições lentas | Pedidos (those are title requests) |
| Statement (SQL) | instrução | declaração |
| Full scan (SQL) | varredura completa | scan completo |
| Query plan | plano da consulta | plano de query |
| Sign-in (the noun: a session being opened, an SSO link) | login: *Este login expirou*, *Esquecer este login* | entrada, acesso, sign-in |
| Sign-in provider | provedor de login | fornecedor, provedor de identidade on a label |
| Issuer (OIDC) | issuer | emissor |
| Client ID / Client secret | ID do cliente / segredo do cliente | Client ID |
| ID token | token de ID | ID token |
| Redirect URI | URI de redirecionamento | |
| Join request (someone asking for an account) | pedido de acesso, Pedidos de acesso | solicitação de entrada |
| Invitation only (a server) | só para convidados | apenas por convite |
| Link (an SSO account to a KROMA account) | vincular, vinculado | ligar, associar |
| Watch history | histórico de exibição (as YouTube); plays imported from another server: histórico de reprodução | histórico de visualização |
| Setup (the first-run wizard) | configuração, configuração inicial; *Configurando o KROMA* | setup, instalação |
| Welcome home (the last setup screen) | Sinta-se em casa. | Bem-vindo (gendered) |
| Bring my Plex or Jellyfin server | Migrar do Plex ou do Jellyfin | Trazer meu servidor |
| Start fresh | Começar do zero | Começar de novo |
| What does not come over (an import) | O que fica para trás | O que não vem |
| Unmatched (titles) | não identificados | não correspondidos |
| Stats for nerds | Estatísticas para nerds (YouTube's own label) | Estatísticas avançadas |
| Stalls (playback) | Travamentos | Paradas, Interrupções |
| Dropped frames | Quadros perdidos | Frames descartados |
| Throughput | Taxa de transferência | Vazão |
| Tunnel up / down, sealed (the VPN) | Túnel ativo / inativo, Túnel protegido · IP de saída {ip} | Túnel em cima, selado |
| Port forwarding | encaminhamento de porta | redirecionamento de porta |
| Device slot (a VPN account) | vaga para dispositivo | slot |
| Drop the file (drag and drop) | Solte o arquivo | Largue, Arraste aqui |
| Grabbed (an upcoming episode already secured) | garantido | capturado, pego |
| Role (of a user: owner, member, restricted) | Função | Papel, Cargo |
| Reset link (a password reset) | link de redefinição; *Redefinir acesso* | link de reset |
| Profile picker | escolha de perfis | seletor de perfis |
| Goal / Cutoff (acquisition profile) | Objetivo / Meta (*Abaixo da meta*, *Meta atingida*) | Corte, Limite |
| Upgrade (a better copy of a file) | melhoria, melhorar (*Permitir melhorias*) | upgrade |
| Score (of a release) | pontuação | score, nota |
| Custom format | formato personalizado | formato customizado |
| Quality ladder | escala de qualidade | escada |
| Season pack | Temporada completa | pack de temporada |
| Source (BluRay, WEB: where a release comes from) | Fonte; where a module or a file is installed from: Origem | |
| Leecher | leecher, leechers | sanguessuga |
| Ratio (a torrent's upload ratio) | Proporção | Ratio, Razão |
| Embedded engine (the built-in torrent client) | Mecanismo integrado | Motor embutido |
| Engine (any: download, decision, playback) | mecanismo | motor |
| Tokens (in a naming template) | Variáveis | Tokens |
| Case (lowercase, UPPERCASE) | Capitalização | Caixa |
| Developer mode (TV, Roku) | modo de desenvolvedor | Modo Desenvolvedor, modo dev |
| Package Center (Synology DSM) | Central de Pacotes, *Origem de pacotes*, *Instalação manual* (DSM's own pt-BR labels) | |
| Become a tester (Google Play) | Tornar-se um testador | Seja um testador |
| Dashboard | Painel | Dashboard |
| Extension point (modules) | ponto de extensão | extension point |
| Add-ons | Complementos | Add-ons, Extensões |
| Capability (what a module provides) | capacidade | capability |
| Scope (OIDC) | escopo; the scope names stay as sent (*openid*, *profile*, *groups*) | |
| Claim (OIDC) | claim (*claim de grupos*) | reivindicação |
| Provider (OIDC, AI) | provedor | fornecedor |
| Release (torrent, NZB) | versão, feminine: *Versão recusada*, *Aceitas · {count}* | lançamento |
| Roku: channel, box, pair | canal, aparelho, Parear | box, dispositivo Roku |
| Self-hosted | auto-hospedado | self-hosted |
| Media server | servidor de mídia | media server |
| Journal (the blog's eyebrow) | Diário de bordo | Diário |
| Resources (a site footer column of links) | Saiba mais (*Recursos* is Features) | Materiais |
| Stable / Canary (release channels) | Estável / Canary on the site; the admin shows the raw channel name | |
| Off, … (a hint that says what happens when a switch is off) | *Se estiver desativado, …* | *Desativado, …* at the head of a sentence |
| Sealed (a VPN tunnel) | protegido | vedado, selado |
| Deleted user | Usuário excluído | Utilizador apagado |

`genre.*` follows TMDB's pt-BR list where TMDB translates the name (Ação,
Aventura, Animação, Comédia, Crime, Documentário, Drama, Família, Fantasia,
História, Terror, Música, Mistério, Romance, Ficção científica, Cinema TV,
Thriller, Guerra, Faroeste). TMDB sends the TV-only genres in English to a
Brazilian reader, so those take a label of their own: Ação e aventura, Infantil,
Notícias, Reality show, Ficção científica e fantasia, Novela, Talk show, Guerra
e política.

`vocab.*` is not shown: it is the words the server recognises in a query or a
synopsis, comma-separated, merged across every language. Never list a word that
is also a common word of another language (*ten*, *cap*), and keep the order of
`vocab.numbers` (two to ten).

## Calques to avoid

| Written | Why it is wrong | Write |
|---|---|---|
| Sua biblioteca de mídia, em casa | English possessive and word order | Seus filmes e séries, em casa |
| Obtenha mais da sua biblioteca | *get more from* word for word | Aproveite melhor a biblioteca |
| Simplesmente funciona | *it just works* | Funciona sem configuração |
| O servidor irá escanear seus arquivos | *irá* + infinitive for every future, and *escanear* | O servidor analisa os arquivos |
| Este recurso tem legendas | *has* a feature | Este recurso oferece legendas |
| Arquivo salvo com sucesso | *successfully* is noise | Arquivo salvo |
| Ocorreu um erro: arquivo não encontrado | the English *an error occurred*, then a colon | Arquivo não encontrado |
| Falha ao carregar | a status label as a sentence | Não foi possível carregar |
| Por favor, insira sua senha | *please* on every instruction | Digite a senha |
| Você está pronto! | a gendered adjective for the reader, and *you are all set* | Tudo pronto |
| Bem-vindo de volta | gendered | Que bom ter você de volta, Boas-vindas |
| {title} foi adicionado | the title's gender is unknown | Novo na biblioteca: {title} |
| Clique aqui | *click* on a TV and a phone | Selecione, Toque em |
| Logar, deslogar | slang | Entrar, Sair |
| Deletar | anglicism | Excluir |
| Assistir agora! | an exclamation mark on every call to action | Assistir |
| Está sendo carregado | English passive progressive | Carregando… |
| Foi deletado pelo administrador | English passive with *por* | O administrador excluiu |
| Através de | *through* where *por* or *com* is enough | por, com, pelo |
| Isso é sobre | *is about* | Isso define, isso controla |
| Experiência de visualização aprimorada | marketing filler | Assista melhor |
| Tudo em um só lugar | *everything in one place* | Filmes e séries no mesmo lugar |
| Consumir mídia | *consume media* | assistir |
| Prestes a | overused *about to* | logo, já vai |
| Eventualmente | false friend (*eventually* is *por fim*, *mais cedo ou mais tarde*) | por fim |
| Realizar uma ação | *perform an action* | a verb: *excluir*, *salvar* |
| Assistir em sua TV | possessive and *em* + possessive | Assistir na TV |
| Não pôde ser encontrado | English passive | Não encontramos (never), Não foi possível encontrar |

The product does not say *nós*: never *Não encontramos*, *Estamos carregando*.

## Plurals

CLDR gives Portuguese (Brazil) **one**, **many** and **other**. **one** is
0 and 1 in Brazil (`i = 0..1`), so without a `_zero` the `_one` form would read
at zero: *0 temporada*. A Brazilian writes *0 temporadas*. So **every** plural
message takes four keys:

- the bare key, the general form: *{count} temporadas*;
- `_one`: *{count} temporada*;
- `_zero`, always: the general sentence again (*{count} temporadas*), or, where
  the source has its own `_zero`, a natural zero sentence (*Nenhum resultado*);
- never `_many` (it is the form for millions, *1 milhão de temporadas*, and
  the general form covers it).

`_zero` is honoured at zero in every language, and `fill` and the check accept
it for `pt`.

The website (`www`) is the exception: its plurals are `_one` and `_other` only,
chosen by `Intl.PluralRules`, which puts 0 under `one` in Portuguese. There is
no `_zero` to write there, so a `_one` sentence there reads at zero as well
(*em 0 país*) until the site picks `other` at zero.

## Turns that make Portuguese sound Brazilian

- The present for the future: *O servidor analisa a pasta*, *A reprodução
  começa em seguida*. *Vai* + infinitive when a future is needed, *irá* almost
  never.
- *Já*, *ainda*, *de novo*: *Já pode assistir*, *Ainda não há títulos*,
  *Entre de novo*, *Comece de novo*. The one exception is retrying, which is
  always *novamente*, as Apple and Google write it: *Tente novamente.* in a
  sentence, *Tentar novamente* on a button.
- *Ficar* and *virar* for a change of state: *A pasta vira uma biblioteca*,
  *A legenda fica mais rápida*.
- *Cada um*: *Cada um com seu perfil.*
- *Onde parou* for *where you left off*: *Continue de onde parou.*
- A colon for a cause or a result: *Sem legendas: escolha um idioma.*
- *Não precisa* + infinitive for *you do not need to*.
- The impersonal *é preciso* or the imperative, not *você precisa* on every
  line.
