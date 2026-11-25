# Korean

What Korean software says, and how. Read it before you write a Korean string.

## Register

- **합니다체** for explanations, confirmations, errors and help text. Never
  *해요체* in the interface: one voice, and the settings and admin screens set it.
- **Noun forms** for buttons, tabs, menu items and labels: *저장*, *취소*,
  *재생*, *설정*. A button is not a sentence.
- Instructions take **~하세요**: *폴더를 선택하세요.* It is the polite request a
  Korean product uses, not a break in register.
- **No 당신.** Korean software does not address the reader with it. Omit the
  pronoun, or name the role: *사용자*, *회원*, *관리자*, *소유자*.
- No *여러분* outside a marketing headline.
- The product does not speak of itself as *우리*. Say *KROMA*.
- Short sentences. One idea per sentence. Korean usually needs fewer words than
  the English, not more.

## The form of each kind of string

| Kind | Form | Example |
|---|---|---|
| Button | noun | *저장*, *취소*, *재생*, *다시 시도* |
| Screen title | noun phrase, or a question | *라이브러리*, *계정 설정*, *KROMA를 종료할까요?* |
| Work in progress | noun + *중…* | *설치 중…*, *스캔 중…*, *저장 중…* |
| Result | past or noun + *됨* | *저장됨*, *복사됨*, *완료* |
| Error | *~할 수 없습니다*, then what to do | *서버에 연결할 수 없습니다. 네트워크와 서버 주소를 확인하세요.* |
| Empty state | what is true, then the way out | *아직 작품이 없습니다. 미디어 폴더를 추가해 보세요.* |
| Hint | a full sentence with its full stop | *각 폴더가 하나의 라이브러리가 됩니다.* |
| Count | number + counter, no space | *시즌 2개*, *10초*, *3개월* |

Never *~가 실패했습니다* for an error. *실패* is a status, not a sentence.
Never *~를 가지다* for a feature: *자막을 지원합니다*, not *자막을 가지고 있습니다*.

## Typography

- No space before `.` `,` `!` `?` `:` `;`; one space after.
- One character for the ellipsis: `…`.
- `·` with spaces for metadata: *프랑스어 · 5.1 · EAC3*.
- Arabic numerals: *4K*, *10초*, *2개*. No space between a number and its counter.
- Sentence case. Proper names keep their capitals; product names stay Latin:
  KROMA, TMDB, Tizen, webOS, Roku, Samsung, LG, Docker, Synology, GitHub, Rust.
- Codec and format names stay as written: HEVC, H.264, H.265, AV1, VP9, AAC, DTS,
  TrueHD, Atmos, HDR, Dolby Vision, NZB, RSS, VPN, SSO, SQL.
- Quotation marks: `“ ”` for a quoted title or label, `‘ ’` only inside one.
- A word, not a symbol: *그리고*, *또는*. Not `+`, not `/`.
- Keep every `{placeholder}` exactly as the source spells it, including repeats.
- Keep markup exactly: `[KROMA]`, `*Settings*`, backticks, Markdown, HTML, URLs,
  `$t(...)`.

## Fixed vocabulary

| English | Korean | Never |
|---|---|---|
| Settings | 설정 | 세팅 |
| Library | 라이브러리 | 보관함, 미디어함 |
| Media library | 미디어 라이브러리 | |
| Movie | 영화 | |
| Series | 시리즈 | TV 프로그램, 드라마 (unless the source says drama) |
| Season | 시즌 | |
| Episode | 에피소드 | 회차 |
| Title (a movie or series) | 작품 | 타이틀, 제목 |
| Content | 콘텐츠 | |
| Play | 재생 | 플레이 |
| Resume, continue watching | 이어보기 | 계속 보기 |
| Pause | 일시정지 | |
| Stop | 정지 | |
| Skip intro | 인트로 건너뛰기 | 오프닝 스킵 |
| Subtitle | 자막 | |
| Audio | 오디오 | 음성 (except an audio track's language) |
| Dub, dubbed | 더빙 | |
| Quality | 화질 | 품질 (for a release, *품질* is fine) |
| Resolution | 해상도 | |
| Bitrate | 비트레이트 | |
| Codec | 코덱 | |
| Transcode, transcoding | 트랜스코딩 | 변환 (only when the source says convert) |
| Direct play | 다이렉트 플레이 | 직접 재생 |
| Stream, streaming | 스트리밍 | |
| Buffer, buffering | 버퍼링 | |
| Server | 서버 | |
| Client | 클라이언트 | |
| Profile | 프로필 | |
| Account | 계정 | |
| User | 사용자 | 유저 |
| Administrator, admin | 관리자 | 어드민 |
| Dashboard | 대시보드 | |
| Home | 홈 | |
| Search | 검색 | |
| Discover, browse | 둘러보기 | 탐색 (only for a file browser) |
| Watchlist, my list | 시청 목록, 내 목록 | 위시리스트 |
| Favorites | 즐겨찾기 | |
| Request | 요청 | |
| Download | 다운로드 | 내려받기 |
| Upload | 업로드 | |
| Folder | 폴더 | |
| File | 파일 | |
| Path | 경로 | |
| Storage | 저장 공간 | 스토리지 |
| Network | 네트워크 | |
| Remote access | 원격 접속 | 원격 액세스 |
| Connection | 연결 | |
| Sign in / Sign out | 로그인 / 로그아웃 | 사인인 |
| Password | 비밀번호 | 패스워드 |
| Passkey | 패스키 | |
| Email | 이메일 | 메일 (for the protocol, *메일* is fine) |
| Invitation | 초대 | |
| Permission | 권한 | 퍼미션 |
| Module | 모듈 | |
| Plugin | 플러그인 | |
| Job, task | 작업 | 잡 |
| Queue | 대기열 | 큐 |
| Pipeline | 파이프라인 | |
| Backup | 백업 | |
| Restore | 복원 | |
| Update | 업데이트 | 갱신 |
| Release | 릴리스 | 배포 (for a software release) |
| Version | 버전 | |
| Build | 빌드 | |
| Release channel | 릴리스 채널 | |
| Genre | 장르 | |
| Director | 감독 | |
| Cast | 출연진 | 캐스트 |
| Actor | 배우 | |
| Rating | 평점 | 별점 (for stars) |
| Runtime | 재생 시간 | 러닝타임 |
| Overview, synopsis | 줄거리 | 개요 |
| Trailer | 예고편 | 트레일러 |
| Artwork | 아트워크 | |
| Poster | 포스터 | |
| Backdrop | 배경 이미지 | |
| Theme | 테마 | |
| Device | 기기 | 디바이스 |
| Session | 세션 | |
| Token | 토큰 | |
| Log | 로그 | |
| Error | 오류 | 에러 |
| Warning | 경고 | |
| Success | 완료 | 성공 |
| Failed | 실패 | |
| Loading | 불러오는 중 | 로딩 중 |
| None | 없음 | |
| All | 전체 | |
| Unknown | 알 수 없음 | |
| Enabled / Disabled | 사용 / 사용 안 함 | 활성화 / 비활성화 |
| On / Off | 켜기 / 끄기 | 온 / 오프 |
| Automatic | 자동 | |
| Custom | 사용자 지정 | 커스텀 |
| Default | 기본값 | 디폴트 |
| Optional | 선택 사항 | 옵션 |
| Required | 필수 | |
| Apply | 적용 | |
| Reset | 초기화 | 리셋 |
| Continue | 계속 | |
| Mute | 음소거 | |
| Volume | 볼륨 | 음량 (in a sentence about loudness) |
| Fullscreen | 전체 화면 | |
| Picture in picture | 화면 속 화면 | |
| Playback speed | 재생 속도 | |
| Aspect ratio | 화면 비율 | |
| Audio track | 오디오 트랙 | |
| Subtitle delay | 자막 지연 | |
| Sync | 동기화 | 싱크 |
| Bandwidth | 대역폭 | |
| Port | 포트 | |
| Host | 호스트 | |
| Certificate | 인증서 | |
| Firewall | 방화벽 | |
| Torrent | 토렌트 | |
| Seeder / Peer | 시더 / 피어 | |
| Indexer | 인덱서 | 색인기 |
| Usenet | 유즈넷 | |
| Webhook | 웹훅 | |
| Two-factor authentication | 2단계 인증 | |
| Recovery code | 복구 코드 | |
| Cache | 캐시 | |
| Snapshot | 스냅샷 | |
| Migration | 마이그레이션 | |
| Scan | 스캔 | |
| Metadata | 메타데이터 | |
| Rematch | 다시 매칭 | 재매칭 |
| Acquisition (the module) | 수집 | |
| Acquisition (the admin page) | 콘텐츠 확보 | |
| Controls (of the player) | 조작 버튼 | 컨트롤 |
| Timeline, scrub bar | 탐색 바 | 타임라인 |
| Queued (a stage) | 대기 중 | 대기열에 있음 |
| Storyboard (seek previews) | 미리보기 이미지 | 스토리보드 |
| Intro and credits detection | 인트로·크레딧 감지 | |
| Kill switch | 킬 스위치 | |
| Uptime | 가동 시간 | |
| Last year (a time range) | 최근 12개월 | 지난해 |
| Top users | 활동이 많은 사용자 | 상위 사용자 |
| Theme song (of a series) | 주제가 | 테마송 |
| Mb/s | Mb/s | Mbit/s (the project writes Mb/s) |
| Skip (a step) | 건너뛰기 | 스킵 |
| Set up, setup | 설정, 구성 | 셋업 |
| Tap to (on a phone) | 탭하여 | 터치하여 |
| Release (a torrent or an NZB) | 릴리스 | |
| Scan | 스캔 | |
| S1E3, Play S1E3 | S1 E3, S1 E3 재생 | 시즌1 3화 (in a compact chip) |
| 3 of 10, 3/10 | 10개 중 3개 | 3 / 10 |
| Text subtitles | 텍스트 자막 | |
| Remuxed, repackaged | 실시간으로 다시 패키징됨 | 리먹스 |
| Match (a title) | 매칭 | |
| Ready to watch (a notification) | 시청 가능 | 볼 준비 완료 |
| Continue Watching | 이어보기 | 계속 시청 |
| My list | 내 목록 | |
| Critically acclaimed | 호평받는 작품 | |
| A-Z (a sort) | 가나다순 | A-Z |
| AI suggestions | AI 추천 | |
| Update available | 업데이트 있음 | 새 버전 있음 |
| Invite a user | 사용자 초대 | |
| Optional | 선택 사항 | |
| e.g. | 예: | |
| Logs | 로그 | |
| Blocklist | 차단 목록 | 블랙리스트 |
| Port forwarding | 포트 포워딩 | 포트 개방 |
| Supervise (a process) | 관리 | 감독 |
| Owner | 소유자 | 오너 |
| Seeding (a torrent) | 시딩 중 | 시드 |
| The swarm | 피어 | 스웜 |
| 1-50 of 200 (a page) | 200개 중 1–50 | 1-50 / 200 |
| Required (a form field) | 필수 입력 | |
| Use at least 8 characters | 8자 이상 입력하세요 | 최소 8자를 사용하세요 |
| Admin (the area) | 관리자 | 어드민 |
| Rights, permissions | 권한 | 퍼미션 |
| PIN | PIN | |
| Link / Unlink (a sign-in provider) | 연결 / 연결 해제 | 링크 |
| You are signed out (a state) | 로그아웃되었습니다 | 당신은 로그아웃되었습니다 |
| Media items (a count) | 작품 | 미디어 |
| Invitation link | 초대 링크 | |
| Feature | 기능 | 피처 |
| LAN address | 로컬 네트워크 주소 | LAN 주소 |
| Roku (the device) | Roku 기기 | Roku들 |
| At any time | 언제든지 | |
| Email | 이메일 | 메일 주소 (both are fine, be consistent) |
| Clear (a field, a search) | 지우기 | 비우기 |
| Done (a button) | 완료 | |
| Sign in failed | 로그인하지 못했습니다 | 로그인 실패 |
| Invalid credentials | 아이디 또는 비밀번호가 올바르지 않습니다 | 잘못된 자격 증명 |
| One-time code | 일회용 코드 | |
| 8+ characters | 8자 이상 | 8+자 |
| Link a device, Quick Connect | 기기 연결, 빠른 연결 | |
| Has already been used (a link, a code) | 이미 사용되었습니다 | 이미 사용됨 |

## Calques already made here, and what was meant

| Written | Why it is wrong | Write |
|---|---|---|
| 당신의 미디어 라이브러리, 집에서 | English possessive and word order | 집에서 즐기는 나만의 미디어 |
| 라이브러리에서 더 많은 것을 얻으세요 | *get more from* word for word | 라이브러리를 더 잘 활용해 보세요 |
| 그것은 그냥 작동합니다 | English *it just works* | 복잡한 설정 없이 바로 사용할 수 있습니다 |
| 서버는 당신의 파일을 스캔할 것입니다 | future tense and pronoun | 서버가 파일을 스캔합니다 |
| 이 기능은 자막을 가지고 있습니다 | *has* a feature | 이 기능은 자막을 지원합니다 |
| 화면에 보이게 만드세요 | *make it visible* | 화면에 표시하세요 |
| 사용자들은 이 설정을 바꿀 수 있습니다 | plural subject and *~들* where Korean omits it | 사용자는 이 설정을 바꿀 수 있습니다 |
| 파일이 성공적으로 저장되었습니다 | *successfully* is noise | 파일을 저장했습니다 |
| 오류가 발생했습니다: 파일을 찾을 수 없습니다 | a colon where Korean wants a full stop | 파일을 찾을 수 없습니다 |
| 미디어를 소비하다 | *consume media* is an English idiom | 작품을 시청하다 |
| 시청 경험을 향상시키세요 | *enhance the viewing experience* is marketing filler | 더 편하게 시청하세요 |
| 이 설정은 ~에 대한 것입니다 | *is about* | 이 설정은 ~을 정합니다 |
| ~를 통해 | *through* where a particle is enough | ~로, ~해서 |
| ~에 의해 | English passive | active voice, or *~되었습니다* |
| 당신이 선택한 언어 | pronoun | 선택한 언어 |
| 모든 것을 한 곳에서 | *everything in one place* | 영화와 시리즈를 한곳에서 |
| 지금 시작하세요! | an exclamation mark on every call to action | 지금 시작하세요 |

## Terms of the administration

| English | Korean | Never |
|---|---|---|
| Mail server | 메일 서버 | 메일서버 |
| Middleware (modules that filter connections) | 연결 필터 모듈 | 미들웨어 |
| Television (a kind of device) | TV | 텔레비전 |
| Config (a WireGuard file) | 설정 파일 | 컨피그 |
| Upload (an image, a file) | 업로드 | |
| Discard your changes? | 변경 사항을 버릴까요? | 변경 사항을 폐기하시겠습니까? |
| No account with us (the project) | KROMA 계정을 만들 필요가 없습니다 | 우리 쪽 계정 |
| Muted (the volume) | 음소거됨 | 무음 |
| est. (estimated) | 예상 | |
| Create their account (one person) | 계정 만들기 | 그들의 계정 만들기 |
| Allowed on the relay (a server) | 릴레이에서 허용됨 | 릴레이가 허용함 |
| The server's database | 서버 데이터베이스 | 서버 DB |
| Go on the internet (a module's access) | 인터넷에 접속 | 인터넷으로 감 |
| Whoever publishes it | 게시자 | 누가 게시하는지 |
| Console (the admin area) | 관리자 | 콘솔 |
| The relay's question (a request to allow a server) | 릴레이 승인 요청 | 릴레이의 질문 |
| Imported (a play) | 가져옴 | 임포트됨 |
| Remote access (the module) | 원격 접속 | 원격 액세스 |
| Watch list, wanted list (titles to fetch) | 시청 목록 | 원하는 목록 |
| Issuer (OpenID Connect) | 발급자 | issuer |
| ID token | ID 토큰 | |
| Library manager (the role) | 라이브러리 관리자 | |
| Content acquisition | 콘텐츠 확보 | 콘텐츠 획득 |

## One screen, one thing to know

Korean makes a long English hint shorter, not longer. Keep the one fact the
reader needs to act now, and move the rest to the screen where it matters.

| Written | Write |
|---|---|
| 이 서버의 소유자 또는 관리자 계정으로 로그인하세요. KROMA는 가져오기를 다시 시작할 수 있도록 이 연결을 유지하며, 요청하는 즉시 잊어버립니다. | 이 서버의 관리자 계정으로 로그인하세요. |
| KROMA는 다른 서버를 읽기만 하며 아무것도 수정하지 않으므로 계속 사용할 수 있습니다. | 지금 사용하는 서버를 선택하세요. |

## Turns that make Korean sound Korean

- *~해 보세요* for an invitation: *미디어 폴더를 추가해 보세요.*
- *~할 수 있습니다* for a capability, not *~가 가능합니다* everywhere.
- *~되지 않습니다* for a state the product prevents.
- *~ 중입니다* and *~ 중…* for progress; *~되었습니다* for a result.
- *~별로* for a grouping: *기기별로*, *언어별로*.
- *~마다* for *each*: *폴더마다 하나의 라이브러리*.
- A colon for a cause or a result: *자막이 없습니다: 언어를 선택하세요.*
- Omit the subject when Korean would: *저장했습니다*, not *저는 저장했습니다*.
