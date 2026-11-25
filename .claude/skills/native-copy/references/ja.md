# Japanese

What Japanese software says, and how. Read it before you write a Japanese string.

## Register

- **です・ます** for every sentence: hints, confirmations, errors, empty states.
  Never the plain form (だ・である) in a sentence, never keigo beyond the set
  phrases below. Netflix, Prime Video, Disney+, Apple, Google and Microsoft all
  write their Japanese interface this way.
- **Nouns or short verb phrases** for buttons, tabs, menu items and labels:
  *保存*, *キャンセル*, *再生*, *設定*, *写真を変更*. A button never ends in
  *〜する* or *〜します*.
- Instructions take **〜してください**: *フォルダーを選択してください。* The set
  phrases *もう一度お試しください* and *しばらくお待ちください* are the only
  honorific forms in the interface; everything else stays plain polite. An
  email adds the two set phrases Japanese mail always uses: *お心当たりがない
  場合は* and *ご自身の*. No *ご〜ください* chains,
  no *〜させていただきます*.
- **No あなた**, ever. Japanese software drops the pronoun, and drops *your*
  with it: *プロフィール*, not *あなたのプロフィール*. Where a role must be
  named, name it: *ユーザー*, *管理者*, *オーナー*. *マイ〜* only where the
  services use it: *マイリスト*, *マイプロフィール*.
- The product never says *私たち*. Say *KROMA*, or leave the subject out.
- No exclamation mark in the interface, no *〜しましょう！*, no *お楽しみください*.
- Short sentences. Japanese usually needs fewer characters than English; if a
  sentence comes out longer than the source, it is probably carrying an English
  idea that Japanese leaves implicit.

## The form of each kind of string

| Kind | Form | Example |
|---|---|---|
| Button | noun, or object + サ変 noun | *保存*, *再生*, *再試行*, *PINを変更*, *このサーバーを許可* |
| Screen title | noun phrase, object + noun, or a question | *マイプロフィール*, *パスワードをリセット*, *ログアウトしますか？* |
| Work in progress | noun + *中…* | *読み込み中…*, *保存中…*, *ログイン中…* |
| Result (toast) | *〜しました*, or noun + *済み* for a state | *プロフィールを保存しました*, *リクエスト済み* |
| Error | *〜できませんでした* (an attempt) or *〜できません* (a state), then what to do | *サーバーに接続できませんでした。ネットワークを確認してください。* |
| Empty state | *〜はまだありません* / *〜がありません*, then the way out | *登録済みのパスキーはまだありません。* |
| Hint | a full sentence with *。* | *メニューやボタンに使われる言語です。* |
| Field label | noun, no full stop | *メールアドレス*, *新しいパスワード* |
| Count | number + counter, no space | *{count}件*, *{count}本*, *{count}話*, *{count}台* |

- An error is never *〜に失敗しました* in a sentence: *〜できませんでした* is
  softer and is what Apple and Google write. *失敗* stays a status label.
- Never *〜を持っています* for a feature: *字幕に対応しています*.
- A label never takes *。*; a sentence always does, even a short one.

## Typography

- Full-width punctuation in Japanese text: *。*, *、*, *？*, *！* (rare), *：*,
  *（）*. The colon is full-width after a Japanese word (*例：*, *出演：*) and
  half-width only between digits (*10:30*).
- **No space** between Japanese and Latin letters, digits or a placeholder, as
  Apple, Google and Netflix write: *4K映像*, *{provider}で続ける*, *{count}件*.
  A space only between two Latin words, and before a value that is not part of
  the sentence: *バージョン {version}*.
- *「」* for a quoted title, label or button name, *『』* inside one. Never `" "`.
- One character for the ellipsis: `…` (U+2026). Never `...` and never `・・・`.
- Ranges with the full-width wave dash `～` (U+FF5E): *1～50件*.
- *・* (U+30FB) joins two parallel nouns or splits a loanword compound:
  *キャスト・スタッフ*, *ピクチャ・イン・ピクチャ*. Not `/`, not `&`, not `+`.
- Half-width Arabic numerals, always: *4桁*, *8文字*, *10秒*, *3か月*.
  *か月*, never *ヶ月* or *カ月*.
- Units in Latin, half-width: *KB*, *MB*, *GB*, *Mbps*, *fps*, *kHz*.
  The project's English writes *Mb/s*; Japanese writes *Mbps*.
- Katakana long vowel, Microsoft's rule: a word ending in *-er*, *-or*, *-ar*
  takes *ー* (*サーバー*, *ユーザー*, *フォルダー*, *プレーヤー*, *フィルター*,
  *エラー*, *モニター*); a word ending in *-ry*, *-ty*, *-gy* does not
  (*ライブラリ*, *カテゴリ*, *セキュリティ*, *ディレクトリ*, *メモリ*).
  So *コンテナー*, *ブラウザー*, never *コンテナ*, *ブラウザ*.
- The product's metadata separator ` · ` (spaces around a U+00B7) stays as the
  source writes it in a compact chip or status line, since other parts of the
  screen are joined with it: *電源オフ · リモコンで電源を入れてください*.
- A list a person types into a field is separated by the half-width comma the
  parser reads; the hint names it as *カンマ（,）*, never *、*.
- What stays Latin: KROMA, TMDB, Tizen, webOS, Roku, Samsung, LG, Apple TV,
  Android TV, Chromecast, AirPlay, Docker, Synology, GitHub, Plex, Jellyfin,
  Emby, Face ID, Touch ID, Wi-Fi, PIN, HTTPS, HTTP, IP, URL, QR (in *QRコード*),
  and every codec and format: HEVC, H.264, AV1, VP9, AAC, AC-3, EAC3, DTS,
  TrueHD, Atmos, HDR, HDR10, Dolby Vision, SDR, 4K, SRT, ASS, PGS, NZB, RSS,
  VPN, SSO, SQL.
- Keep every `{placeholder}` exactly as the source spells it, including
  repeats; move it wherever Japanese word order puts it.
- Keep markup exactly: `[KROMA]`, `*Settings*`, backticks, Markdown, HTML, URLs,
  `$t(...)`.

## Fixed vocabulary

| English | Japanese | Never |
|---|---|---|
| Settings | 設定 | セッティング |
| Library | ライブラリ | ライブラリー, 書庫 |
| Media library | メディアライブラリ | |
| Movie | 映画 | ムービー |
| Series | シリーズ | TVシリーズ, ドラマ (unless the source says drama) |
| Season | シーズン | |
| Episode | エピソード; *第{n}話* or *{n}話* in a count | |
| Title (a movie or series) | 作品 | タイトル (that is the name of a work) |
| Content | コンテンツ | |
| Play | 再生 | プレイ |
| Resume (the button) | 続きから再生 | 再開 |
| Start over | 最初から再生 | |
| Continue Watching (the row) | 続きを見る | 視聴を続ける, 継続視聴 |
| Pause | 一時停止 | ポーズ |
| Stop | 停止 | |
| Skip intro / Skip credits | イントロをスキップ / クレジットをスキップ | 導入部を飛ばす |
| Next episode | 次のエピソード | |
| Subtitle | 字幕 | サブタイトル |
| Audio | 音声 | オーディオ (except *オーディオフィルター* style technical terms) |
| Audio track | 音声トラック | |
| Dub, dubbed | 吹き替え | ダブ |
| Quality | 画質 | クオリティ (for a release, *品質*) |
| Resolution | 解像度 | |
| Bitrate | ビットレート | |
| Codec | コーデック | |
| Transcode, transcoding | トランスコード | 変換 (only when the source says convert) |
| Direct play | ダイレクト再生 | 直接再生, ダイレクトプレイ |
| Stream, streaming | ストリーミング | |
| Buffer, buffering | バッファリング | |
| Server | サーバー | サーバ |
| Client | クライアント | |
| Profile (a person's) | プロフィール | プロファイル (only for an acquisition *品質プロファイル*) |
| My profile | マイプロフィール | 私のプロフィール |
| Account | アカウント | |
| User | ユーザー | ユーザ |
| Administrator, admin | 管理者 | アドミン |
| Admin (the area), console | 管理画面 | コンソール |
| Owner | オーナー | 所有者 (legal), 持ち主 |
| Dashboard | ダッシュボード | |
| Home | ホーム | |
| Search | 検索 | サーチ |
| Discover, browse | 見つける (a tab), 探す (an action) | ディスカバー, ブラウズ |
| Watchlist, My list | マイリスト | ウォッチリスト, ウィッシュリスト |
| Favorites | お気に入り | |
| Request | リクエスト | 要求, 申請 |
| Download / Upload | ダウンロード / アップロード | |
| Folder | フォルダー | フォルダ |
| File | ファイル | |
| Path | パス | 経路 |
| Storage | ストレージ | |
| Network | ネットワーク | |
| Local network | ローカルネットワーク | LAN (in a sentence) |
| Remote access | リモートアクセス | 遠隔アクセス |
| Connection | 接続 | コネクション |
| Sign in / Sign out | ログイン / ログアウト | サインイン, サインアウト |
| Sign up, register | 登録, アカウントを作成 | サインアップ |
| Password | パスワード | |
| Passkey | パスキー | |
| PIN | PIN | PINコード, 暗証番号 |
| Email (the address) | メールアドレス | Eメール, イーメール |
| Email (the medium) | メール | |
| Username | ユーザー名 | |
| Invitation | 招待 | インビテーション |
| Permission, rights | 権限 | パーミッション |
| Module | モジュール | |
| Plugin | プラグイン | |
| Job, task | タスク | ジョブ |
| Queue | キュー | 待ち行列 |
| Queued (a stage) | 待機中 | キュー済み |
| Pipeline | パイプライン | |
| Backup / Restore | バックアップ / 復元 | リストア |
| Update (software) | アップデート | 更新 (that is refresh) |
| Refresh | 更新 | リフレッシュ |
| Update available | アップデートがあります, *アップデートあり* on a badge | 新バージョン |
| Release (software) | リリース | |
| Release (a torrent or an NZB) | リリース | |
| Version | バージョン | |
| Build | ビルド | |
| Release channel | リリースチャンネル | |
| Genre | ジャンル | |
| Director | 監督 | ディレクター |
| Cast (the section) | キャスト | |
| Cast (a credit line) | 出演 | |
| Crew | スタッフ | クルー |
| Actor | 俳優 | アクター |
| Rating (score) | 評価 | レーティング |
| Age rating | 年齢区分 | 年齢レーティング |
| Parental restriction | 視聴制限 | ペアレンタルコントロール (except Apple's own setting) |
| Runtime | 上映時間 (a film), 再生時間 (a file) | ランタイム |
| Overview, synopsis | あらすじ | 概要, シノプシス |
| Trailer | 予告編 | トレーラー |
| Artwork | アートワーク | |
| Poster | ポスター | |
| Backdrop | 背景画像 | バックドロップ |
| Theme (appearance) | テーマ | |
| Appearance | 外観 | アピアランス |
| Dark / Light / System | ダーク / ライト / システム | |
| Device | デバイス | 端末, 機器 |
| Television (a kind of device) | テレビ | TV (in a sentence), テレビジョン |
| Session | セッション | |
| Token | トークン | |
| Log, logs | ログ | |
| Error | エラー | |
| Warning | 警告 | |
| Success | 完了 | 成功 |
| Failed (a status) | 失敗 | |
| Loading | 読み込み中… | ローディング |
| None | なし | ナシ |
| All | すべて | 全部, 全て |
| Unknown | 不明 | アンノウン |
| Enabled / Disabled | オン / オフ (a switch), 有効 / 無効 (a state) | アクティブ / 非アクティブ |
| On / Off | オン / オフ | |
| Automatic | 自動 | オート |
| Custom | カスタム | |
| Default | デフォルト | 既定 (that is Microsoft's word alone) |
| Default (a track flag) | デフォルト | |
| Standard | 標準 | スタンダード |
| Optional | 任意 | オプション |
| Required | 必須 | |
| Required (a form field) | 入力してください | この項目は必須です |
| Apply | 適用 | |
| Reset | リセット | |
| Continue | 続ける | 継続 |
| Next / Back | 次へ / 戻る | |
| Done | 完了 | 終了 |
| Retry, try again | 再試行 (a button), もう一度お試しください (a sentence) | リトライ |
| Cancel | キャンセル | 取り消し |
| Close | 閉じる | |
| Save | 保存 | セーブ |
| Delete / Remove | 削除 / 外す (from a list or a row, where nothing is destroyed) | 消去 |
| Clear (a field, a search) | クリア | 空にする |
| Edit | 編集 | |
| Mute / Unmute | ミュート / ミュート解除 | 消音 |
| Volume | 音量 | ボリューム |
| Fullscreen | 全画面表示 | フルスクリーン |
| Picture in picture | ピクチャ・イン・ピクチャ | PiP alone |
| Playback speed | 再生速度 | |
| Aspect ratio | アスペクト比 | |
| Subtitle delay | 字幕のタイミング | 字幕ディレイ |
| Sync | 同期 | シンク |
| Bandwidth | 帯域幅 | |
| Port | ポート | |
| Host | ホスト | |
| Certificate | 証明書 | |
| Firewall | ファイアウォール | |
| Torrent | トレント | |
| Seeder / Peer | シーダー / ピア | |
| Seeding (a torrent) | シード中 | |
| The swarm | ピア | スウォーム |
| Indexer | インデクサー | 索引 |
| Usenet | Usenet | ユーズネット |
| Webhook | Webhook | ウェブフック |
| Two-factor authentication | 2段階認証 | 二要素認証 |
| One-time code | ワンタイムコード | 使い捨てコード |
| Cache | キャッシュ | |
| Snapshot | スナップショット | |
| Migration | 移行 | マイグレーション |
| Scan | スキャン | 走査 |
| Metadata | メタデータ | |
| Match (a title) | 照合 | マッチング, 一致 |
| Fix the match, rematch | 照合を修正, 再照合 | 再マッチ |
| Probing (a file) | ファイルの解析 | プローブ |
| Acquisition (the module) | 自動取得 | 獲得 |
| Controls (of the player) | 操作ボタン | コントロール |
| Timeline, scrub bar | シークバー | タイムライン |
| Storyboard (seek previews) | シークプレビュー | ストーリーボード |
| Intro and credits detection | イントロ・クレジットの検出 | |
| Theme song (of a series) | テーマ曲 | テーマソング |
| Kill switch | キルスイッチ | |
| Uptime | 稼働時間 | アップタイム |
| Last year (a time range) | 過去12か月 | 昨年 |
| Top users | よく使っているユーザー | トップユーザー |
| Mb/s | Mbps | Mb/s |
| Skip (a step) | スキップ | 飛ばす |
| Set up, setup | 設定, セットアップ (the first-run flow) | |
| Tap to (on a phone) | タップして | 押して |
| S1E3, Play S1E3 | S1:E3, S1:E3を再生 | シーズン1第3話 (in a compact chip) |
| 3 of 10 | 3/10, or *10件中3件* in a sentence | 3 of 10 |
| Step 2 of 3 | ステップ2/3 | 3のうち2 |
| 1-50 of 200 (a page) | 200件中1～50件 | 1-50 / 200 |
| Text subtitles | テキスト字幕 | |
| Remuxed, repackaged | コンテナーのみ変換 | リマックス |
| Ready to watch (a notification) | 視聴できます | 視聴の準備ができました |
| Critically acclaimed | 高評価の作品 | 批評家絶賛 |
| A-Z (a sort) | 名前順 | A-Z |
| AI suggestions | AIのおすすめ | AI提案 |
| Recommendations | おすすめ | レコメンド |
| Invite a user | ユーザーを招待 | |
| e.g. | 例： | e.g. |
| Blocklist | ブロックリスト | ブラックリスト |
| Port forwarding | ポートフォワーディング | ポート開放 |
| Supervise (a process) | 監視 | 監督 |
| Use at least 8 characters | 8文字以上で入力してください | 最低8文字を使用してください |
| 8+ characters | 8文字以上 | 8+文字 |
| Link / Unlink (a sign-in provider) | 連携 / 連携を解除 | リンク / アンリンク |
| Sign-in providers | ログイン連携 | サインインプロバイダー |
| You are signed out (a state) | ログアウトしました | あなたはログアウトされています |
| Sign in failed | ログインできませんでした | ログイン失敗 |
| Invalid credentials | ユーザー名またはパスワードが正しくありません | 無効な資格情報 |
| Media items (a count) | 作品 | メディア |
| Invitation link | 招待リンク | |
| Feature | 機能 | フィーチャー |
| LAN address | ローカルネットワークのアドレス | LANアドレス |
| Roku (the device) | Roku | Rokuデバイス |
| At any time | いつでも | |
| Link a device, Quick Connect | デバイスを接続, クイック接続 | |
| Has already been used (a link, a code) | すでに使用されています | 既に使われた |
| Household (everyone on the server) | 家族 | 世帯 |
| {count} items | {count}件 | {count}個のアイテム |
| Cast (send to a TV), Stop casting | テレビで再生, キャストを停止 | 投影, ミラーリング |
| Remote (the control) | リモコン | リモート |
| Phone / computer | スマートフォン / パソコン | スマホ, コンピューター |
| Browser | ブラウザー | ブラウザ |
| Video (what plays) / video (the track, beside 音声) | 動画 / 映像 | ビデオ |
| Container (a file's) | コンテナー | コンテナ |
| Media details (the file's codecs) | ファイル情報 | メディア詳細 |
| Standard edition | 通常版 | スタンダードエディション |
| Recap (Skip recap) | あらすじ (あらすじをスキップ) | リキャップ |
| Up next | 次に再生 | アップネクスト |
| Watched / Unwatched | 視聴済み / 未視聴 | 見た / 見てない |
| Mark as watched | 視聴済みにする | 視聴済みとしてマーク |
| Trending | 話題の作品, 今話題の作品, *話題作* on a chip | トレンド |
| New (a badge), New movies | 新着, 新着映画 | ニュー |
| Featured | 注目作品 | フィーチャー |
| Sort options (Recently added, Rating, Title, Year) | 追加日順, 評価順, タイトル順, 公開年順 | 最近追加された |
| Sort by | 並べ替え | ソート |
| From {director} (a row) / With {actor} (a row) | {name}監督作品 / {name}出演作品 | {name}から / {name}と |
| Because you watched {title} | 「{title}」を見た人におすすめ | あなたが見たので |
| Who's watching? | 視聴するプロフィールを選択 | 誰が見ていますか？ |
| Your space (the reader's own pages) | マイページ | あなたのスペース |
| My requests | マイリクエスト | 私のリクエスト |
| Quit (the app) | 終了 | 退出 |
| Biography / Known for / Filmography | 略歴 / 代表作 / 作品一覧 | バイオグラフィー |
| Born / Died, (aged 80) | 生年月日 / 没年月日, （80歳没） | |
| Original title / Tagline / Sort title | 原題 / キャッチコピー / 並べ替え用タイトル | オリジナルタイトル, タグライン |
| Transcribe / Translate (a subtitle) | 文字起こし / 翻訳 | トランスクライブ |
| Forced (subtitles) | 強制字幕 | フォースド |
| Subtitle edge styles | 浮き彫り, 沈み彫り, 輪郭, ドロップシャドウ (YouTube's words) | |
| Subtitle fonts | 等幅サンセリフ, 等幅セリフ, サンセリフ, セリフ, カジュアル, 筆記体, スモールキャピタル | |
| Audio filters, Night mode, Boost | オーディオフィルター, ナイトモード, ブースト | |
| Reset link / Confirmation link | リセット用リンク / 確認用リンク | リセットリンク |
| Verify an email address | メールアドレスを確認 | 検証 |
| All ages, 13+ (maturity) | 全年齢, 13歳以上 | 13+ |
| Rated {label} | 年齢区分：{label} | レーティング |
| Step 2 of 3 | ステップ2/3 | |
| N min ago, just now | {n}分前, たった今 | |
| {h} h {m} min (a duration) | {hours}時間{minutes}分 | h, min |
| Monitored (a title the acquisition watches) | 監視中 | フォロー中 |
| Follow / Monitor (the acquisition watching a title); Stop following | 監視する; 監視を停止. "Follow" and "Monitor" are one action, both 監視 | フォロー |
| Followed / not followed (a toast, a filter) | 監視対象に追加しました / 監視を停止しました; 監視中 / 未監視 | |
| Air status: Canceled / Ended / In production / Planned / Post-production / Released / Returning / Announced | 打ち切り / 終了 / 制作中 / 制作予定 / ポストプロダクション / 公開済み / 放送中 / 発表済み | |
| Preset (monitored episodes) | プリセット | 事前設定 |
| Specials (season 0) | 特別編 | スペシャル |
| On disk (a file the server holds) | 保存済み, {count}件保存済み | ディスク上 |
| On the way (grabbed) | 取得中 | 途中 |
| {a} of {b} (a count) | {b}件中{a}件; {total}作品中{shown}作品 | {a}の{b} |
| Undo | 元に戻す | 取り消し |
| Isolation (a module's) | モジュールの分離環境 | サンドボックス |
| Direct (a network route, not the VPN) | 直接 | |
| Computer (a client kind) | パソコン | |
| Kids profile | キッズプロフィール | 子供用プロフィール |
| Notification; Push (the channel) | 通知; プッシュ, プッシュ通知 | お知らせ (only in a sentence: *お知らせがここに届きます*) |
| Archive / Archived; Read / Unread; Mark as read | アーカイブ / アーカイブ済み; 既読 / 未読; 既読にする | |
| Problem report (a viewer's, `reports.`, the admin page *Reports*) | 問題の報告, 報告 | レポート, which stays for the crash and usage reports the server sends |
| Network rule: Allow / Block / Direct / Through the VPN | 許可 / ブロック / 直接 / VPN経由 | |
| Connection; Destination; Caller (who opened it); Route | 接続; 接続先; 発信元; 経路 | |
| Listening (a port) / Incoming | 待ち受け / 受信接続 | リスニング |
| Discard (unsaved changes) / Stay | 破棄 / 編集を続ける | |
| Optional (a field placeholder) | 任意 | オプション |
| Approve / Deny, Decline (a request, a join request) | 承認 / 却下, on a button too: the viewer reads *参加リクエストを却下しました* | 否認, 拒否 (that is a system refusing: *トークンが拒否されます*) |
| {user} did something (a notification) | {user}さんが…しました | |
| Player (a playback engine) | プレーヤー: *VLCプレーヤー*, *ブラウザーのプレーヤー* | プレイヤー |
| Pipeline: Element / Stage / Reprocess / Retry | 項目 / ステージ / 再処理 / 再試行 | 要素 |
| Needs action | 要対応 | |
| Report status: Open / Resolved / Dismissed; Reopen | 未対応 / 解決済み / 却下; 未対応に戻す | オープン, 再オープン |
| Request status: Pending / In progress / Available / Denied | 承認待ち / 進行中 / 視聴可能 / 却下 | |
| Free search (indexers) / Interactive search | キーワード検索 / 手動検索 | フリー検索, インタラクティブ検索 |
| Grab (a release) | 取得 | グラブ |
| Enable / Disable (push on a device) | オンにする / オフにする | 有効化 / 無効化 |
| What's new (release notes) | 新機能; リリースノート | 最新情報 |
| Upcoming (a tab of films and episodes) / To air (an episode) | 今後の予定 / 放送予定 | |
| Import (from Plex or Jellyfin); Bring my server | インポート; 移行 | 取り込み |
| A feature of the server being imported (Plex's watchlist, playlists, live TV) | that server's own name: ウォッチリスト, プレイリスト, ライブTV | マイリスト (KROMA's own) |
| Remove (a folder from a list, nothing deleted) | 外す | 削除 (that deletes) |
| Your account (in a list of people) | ご自身のアカウント | あなたのアカウント |
| The provider (an OpenID Connect issuer, in admin text) | プロバイダー; issuer → 発行者; ID token → IDトークン; client secret → クライアントシークレット; signing key → 署名鍵 | |
| Join request (someone asking to join a server) | 参加リクエスト | 参加申請 |
| Invitation only | 招待制 | |
| Buffer (a stats row) / Dropped frames / Stats for nerds | バッファー / ドロップフレーム / 詳細統計情報 | |
| Torrent traffic; Tunnel up / down | トレントの通信; トンネル稼働中 / 停止中 | トラフィック |
| A label and its value (`Prio {prio}`) | a full-width colon: *優先度：{prio}*; in a compact stat line of several values, a space: *稼働時間 {uptime}* | |
| Performance: Request / Query / Statement / Call / Full scan / Query plan | リクエスト / クエリ / ステートメント / 呼び出し / フルスキャン / クエリプラン | |
| Upgrade (a better copy of a file) | アップグレード | 改善 |
| Better-version search | アップグレード検索 | |
| Recycle bin | ごみ箱 | リサイクルビン |
| Tracker (a torrent site) | トラッカー | |
| Private / Semi-private / Public (trackers) | プライベート / セミプライベート / パブリック | 非公開 |
| Built-in | 組み込み | ビルトイン |
| Relay (the kroma.tv mail relay) | リレー | 中継 |
| Public IP address | 公開IPアドレス | グローバルIP |
| Scheduled backup | 自動バックアップ | 予定されたバックアップ |
| Cron expression | cron式 | |
| Maintenance | メンテナンス | 保守 |
| Command menu actions | 操作 | アクション |
| Turn on / Turn off (a module) | オンにする / オフにする | 有効化 / 無効化 |
| About (the page) | KROMAについて | アバウト |
| Copy versions | バージョン情報をコピー | |
| Thumbnail (an episode still) | サムネイル | スチル |
| If you did not ask for it, ignore this email (email set phrase) | お心当たりがない場合は、このメールを無視してください。何も変更されません。 | |
| Missing (episodes, the view) | 不足, 「不足」ビュー, 不足エピソード | 欠落, 欠品 |
| Enrichment (fetching metadata) | メタデータの取得 | エンリッチメント, 強化 |
| Incremental (a job) | 差分処理 | インクリメンタル |
| Resumable | 中断・再開できる | 再開可能な |
| Embedding (recommendations) | 埋め込み | エンベディング |
| Fingerprint (audio, video) | フィンガープリント | 指紋 |
| Loudness | ラウドネス | 音の大きさ |
| Digest (new arrivals) | 新着ダイジェスト | 要約 |
| Job status: Running / Succeeded / Failed / Cancelled | 実行中 / 完了 / 失敗 / キャンセル済み | 成功 |
| Trigger: manual / scheduled / chained / file change | 手動 / スケジュール / 連鎖実行 / ファイルの変更 | |
| Last run / Next run | 前回 / 次回 | 最後 / 次 |
| Run now | 今すぐ実行 | |
| Editorial collections | 特集コレクション | 編集コレクション |
| Host updater | ホストのアップデーター | ホストツール |
| Language names (`lang.*`) | CLDR's Japanese names, *〜語*: 英語, 韓国語, スペイン語（スペイン） | |

### Admin and modules

| English | Japanese | Never |
|---|---|---|
| Scheduled tasks (the page title) / Tasks (the nav entry) | スケジュールされたタスク / タスク | ジョブ |
| Role (a person's on the server) | 役割 | ロール |
| Join request: Approve / Decline; {count} declined | 承認 / 却下; 却下したリクエスト{count}件 | 拒否 |
| New people: Ask me first / Invitation only | 承認制 / 招待制 | 事前に承認, 招待のみ |
| Maturity rating / Ratings country | 視聴制限 / 年齢区分の国 | レーティング |
| Clear PIN / Clear cache | PINを削除 / キャッシュをクリア | |
| Available / Used (disk); {pct}% used | 空き容量 / 使用済み; 使用率{pct}% | {pct}%使用 |
| Sources (media folders) | ソース | |
| Replace an invitation | 再発行 | 置き換え |
| Test sign-in | テストログイン | テストサインイン |
| Redirect URI; scope; group claim | リダイレクトURI; スコープ; グループクレーム | |
| Update channel; Stable / Canary | アップデートチャンネル; Stable / Canary (Latin) | 安定版 |
| Tested with X | Xで動作確認済み | Xでテスト済み |
| v{version} available (a chip) | v{version}が利用可能 | v{version}あり |
| Store / add-on / connector | ストア / アドオン / コネクター | |
| Registry (a module catalog) | レジストリ | 登録所 |
| Extension point; Answers / Needs (points) | 拡張ポイント; 提供するポイント / 必要なポイント | |
| Depends on / Needed by / Called by | 依存先 / 依存元 / 呼び出し元 | |
| Inert (a module whose dependency is missing) | 依存関係が不足 | 不活性 |
| Quality profile | 品質プロファイル | 品質プロフィール |
| Cutoff (where upgrades stop) | 目標 | カットオフ |
| Quality ladder | 品質の優先順位 | 品質のはしご |
| Custom format | カスタムフォーマット | |
| A better copy (a release, a file) | より良いリリース; 最高品質のファイル | コピー (a media file is never a コピー) |
| Upgrade until | アップグレードの上限 | |
| Seeders / Leechers; Revision; Season pack | シーダー / リーチャー; リビジョン; シーズンパック | |
| Original language | 原語 | オリジナル言語 |
| Tracker flags (Freeleech, Internal...) | katakana: フリーリーチ, インターナル | |
| Magnet | マグネットリンク | |
| Link to a title | 作品に関連付け | 作品にリンク |
| Naming tokens; Case | トークン; 大文字・小文字 | ケース |
| Ratio / Throughput | 共有比 / 転送速度 | レシオ, スループット |
| Exit IP (the VPN's) | 出口IP | |
| A menu path | 「A」>「B」, or → where the source writes →; a third-party device's own path stays as the device shows it (Roku's 「Settings」>「Network」>「About」) | |

### Genre names

`genre.*` must equal TMDB's own Japanese genre names, spelling included: KROMA
matches stored genre names against these labels. TMDB's Japanese list is:
アクション, アドベンチャー, アニメーション, コメディ, 犯罪, ドキュメンタリー,
ドラマ, ファミリー, ファンタジー, 履歴, ホラー, 音楽, 謎, ロマンス,
サイエンスフィクション, テレビ映画, スリラー, 戦争, 西洋.

Three labels deliberately differ from TMDB's spelling: `genre.history` is
*歴史*, `genre.mystery` *ミステリー* and `genre.western` *西部劇*, where TMDB
writes *履歴*, *謎* and *西洋*, which are mistranslations a Japanese reader
takes for bugs. A title enriched with TMDB's genre ids is matched by id, so the
label is only what the viewer reads; only a genre stored by name without an id
misses the match, and it then shows TMDB's own spelling. Every other label
keeps TMDB's spelling.

TMDB sends its TV genres in English to a Japanese reader (Action & Adventure,
Kids, News, Reality, Sci-Fi & Fantasy, Soap, Talk, War & Politics). Those take
a Japanese label of their own, since the English label already matches.

### Word lists (`vocab.*`)

These are not shown: the server reads them to recognise a query or a synopsis.
Write the words a Japanese query or synopsis uses (*シーズン*, *話*, *ドラマ*,
*実話*), comma-separated. `vocab.numbers` runs from two to ten in order:
*二, 三, … 十*. Japanese has no articles and no abbreviations that end in a
full stop, so `vocab.articles` and `vocab.abbreviations` stay unwritten.

## Calques to avoid

| Written | Why it is wrong | Write |
|---|---|---|
| あなたのライブラリ | the English possessive | ライブラリ |
| 〜することができます | *can do* word for word | 〜できます |
| 正常に保存されました | *successfully* is noise, and the passive | 保存しました |
| 〜に失敗しました on every error | the English *failed to* | 〜できませんでした |
| 〜によって作成されました | English passive with an agent | 〜が作成しました, or the active |
| この機能は字幕を持っています | *has* a feature | 字幕に対応しています |
| 私たちはあなたのデータを保存しません | the product says *we* | KROMAはデータを保存しません |
| すべてが一か所に | *everything in one place* | 映画もシリーズもまとめて |
| 準備ができました！ | *you are all set* with an exclamation | 準備が整いました |
| ライブラリからもっと多くを得る | *get more from* | ライブラリをもっと活用 |
| 〜についての設定 | *settings about* | 〜の設定 |
| ユーザーたち, デバイスたち | an English plural Japanese does not mark | ユーザー, デバイス |
| 彼らのアカウント | *their* for one person | そのユーザーのアカウント, or nothing |
| エラーが発生しました：ファイルが見つかりません | a colon where Japanese wants one sentence | ファイルが見つかりません |
| サーバーはあなたのファイルをスキャンするでしょう | future tense and pronoun | サーバーがファイルをスキャンします |
| サーバーが拒否しています (the server as a person) | a thing doing a human act | 再生できません |
| メディアを消費する | *consume media* | 作品を見る |
| 視聴体験を向上させます | marketing filler | もっと快適に視聴できます |
| サーチ, セッティング, ムービー | a katakana loan where Japanese has the word | 検索, 設定, 映画 |
| 今すぐ始めましょう！ | a cheer on a call to action | 始める |

## Turns that make Japanese sound Japanese

- Drop the subject when it is the reader or the product: *保存しました*, not
  *KROMAが保存しました*.
- *〜できます* for a capability, *〜できません* for a limit, *〜されます* for
  what happens on its own (*自動で選択されます*).
- *〜ごとに* for *each*: *フォルダーごとにライブラリが1つ作成されます*.
- *〜別* for a grouping: *デバイス別*, *言語別*.
- *〜中* for progress, *〜済み* for a finished state: *シード中*, *リクエスト済み*.
- A question as a title for a choice that cannot be undone: *ログアウトしますか？*
- The particle carries the meaning English gives to *with*, *through*, *by*:
  *パスキーでログイン*, not *パスキーを使用してログイン*.

## Plurals

CLDR gives Japanese one category, `other`, and `todo` lists only `other`. Write
the bare key alone; Japanese does not change a noun with a count. The counter
carries the meaning: *{count}件*, *{count}本* (films), *{count}作品*,
*{count}話* (episodes), *{count}シーズン*, *{count}台* (devices, servers),
*{count}人* (people), *{count}個* (modules, files, libraries, models),
*{count}種類* (kinds: *{count}種類の品質*), *{count}文字*, *{count}桁*. The
website (`apps/www`) uses `Intl.PluralRules`, so a plural message there is the
`_other` key. `key_zero` only where the source has one and a
zero sentence reads better (*結果はありません*).
