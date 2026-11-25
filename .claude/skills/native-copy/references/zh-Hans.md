# Simplified Chinese (zh-Hans)

What Simplified Chinese software says, and how. Read it before you write a
zh-Hans string. The reader is in mainland China, Singapore or Malaysia and
already knows the words of Netflix, Apple TV, Bilibili, iQIYI, Jellyfin and of
Apple, Microsoft and Android system UI in Simplified Chinese.

## Register

- **你**, never **您**. Apple, Microsoft (since Windows 10) and most Chinese
  apps of the last ten years write 你; 您 reads like a bank letter or a
  customer-service script, and mixing the two on one screen reads as two
  writers. One voice everywhere, the admin screens included.
- **No pronoun at all** is usually better. Chinese drops the subject and the
  possessive that English needs: *已保存*, not *你的设置已保存*; *更改密码*,
  not *更改你的密码*. Write 你 only where the sentence would be unclear
  without it (*你邀请的人*), and 你的 almost never.
- Buttons, tabs and menu items are **a verb or a verb + object**, two to four
  characters where possible: *播放*, *保存*, *取消*, *重试*, *添加媒体库*.
- **请** belongs to an instruction that follows a problem (*请稍后重试。*,
  *请检查网络连接。*), as Apple writes it in an alert. A hint that only
  explains takes no 请. Never 请您.
- The product does not speak of itself as *我们*. Say *KROMA*, or drop the
  subject. The product does not do human things either: it does not *wait*,
  *speak* or *know*.
- Plain, calm, short. No exclamation mark on a call to action, no 哦, 啦, 呢,
  亲, no internet slang. One idea per sentence; Chinese usually needs fewer
  characters than the English, never more.

## The form of each kind of string

| Kind | Form | Example |
|---|---|---|
| Button | verb, or verb + object | *播放*, *保存*, *重试*, *添加文件夹* |
| Button that speaks for the reader | verb + object, no 我的 unless it is the point | *创建账户*, *设置新密码* |
| Screen title | noun phrase, or a question | *媒体库*, *账户安全*, *要退出 KROMA 吗？* |
| Confirmation title | 要…吗？ | *要删除此个人资料吗？*, *要放弃更改吗？* |
| Work in progress | 正在 + verb + … | *正在加载…*, *正在扫描…*, *正在保存…* |
| Result | 已 + verb | *已保存*, *已复制*, *已发送请求* |
| Error | 无法 + verb, then what to do | *无法连接到服务器。请检查网络和服务器地址。* |
| Error, short label | noun + 失败 is fine in Chinese for a status | *登录失败*, *上传失败* |
| Empty state | what is true (暂无, 还没有), then the way out | *还没有作品。添加一个媒体文件夹即可开始。* |
| Hint | a full sentence ending in 。 | *每个文件夹都会成为一个媒体库。* |
| Count | number + counter, half-width space | *3 季*, *12 集*, *5 部作品*, *2 台设备*, *10 秒* |
| Ordinal | 第 + number + counter | *第 2 季*, *第 3 集*, *第 1 步，共 3 步* |

- A button never ends with 。. A hint, an error, an empty state always does,
  when it is a sentence. A label or a short status (*已保存*) takes none.
- A question title ends with the full-width ？.
- *失败* alone is a status. As a full sentence, prefer *无法…*: *无法保存更改。*

## Typography

- **Full-width punctuation** in Chinese text: ，。、：；？！（）“” 《》. Never the
  ASCII `,` `.` `:` `?` `!` `(` `)` between Chinese characters.
- **Half-width space between Chinese and Latin letters or digits**, as Apple and
  Microsoft Chinese write it: *4K 视频*, *共 3 集*, *HDR 内容*, *KROMA 服务器*.
  No space between full-width punctuation and anything: *（HDR）*, *“设置”*.
  No space between a digit and `%`, `°`, `×`, nor inside a Latin unit
  (*512×512*, *1.5×*, *25%*). A space between a number and a Latin unit:
  *20 Mb/s*, *4 GB*.
- **Placeholders** take the rule of what they hold:
  - a number, a time, a size, a version, a host, an address, a code, a codec
    or a provider name (Google, GitHub) counts as Latin: a space on each side
    against Chinese (*共 {count} 集*, *版本 {version}*, *通过 {provider} 继续*);
  - a free text that is often Chinese (a title, a person, a user, a device, a
    library, a genre) takes no space. In a sentence, set it off: a work's
    title in 《》 (*因为你看过《{title}》*), a user, a device, a profile or a
    library in “” (*正在“{device}”上播放*, *“{user}”接管了遥控器*), as Apple
    and WeChat do. A cast or crew name abuts, as Douban writes it:
    *{name}执导*, *{name}主演*. A genre abuts or follows a `·`;
  - never a space beside full-width punctuation (*“{name}”*, *（{count}）*).
- **Quotation marks**: “ ” for a quoted label, a name or a setting
  (*“{name}”*, *“设置”*); ‘ ’ only inside them. Never 「」, which is the
  Traditional and Japanese use.
- **Book-title marks 《》** around the title of a work in a sentence:
  *已将《{title}》添加到媒体库*, *《{title}》可以观看了*. Not around a title in a
  list, a card or a heading, where it stands alone.
- **Ellipsis**: one `…` (U+2026) after a work in progress or a menu item that
  opens more (*正在加载…*, *更多…*), as the source writes it. Never `...`.
  The doubled `……` is for prose and is not used in the interface.
- **Enumeration comma 、** between items of a list inside a sentence:
  *电影、剧集和纪录片*. A comma `，` between clauses.
- **Dash**: a range is an en dash with no spaces (*1–50*); prose takes none.
- **Middle dot** `·` with spaces for metadata, as the source has it:
  *法语 · 5.1 · EAC3*.
- Arabic numerals everywhere: *4K*, *10 秒*, *第 2 季*. Not 二 or 两 for a count
  the product computes.
- **Stays Latin**: KROMA, TMDB, Tizen, webOS, Roku, Samsung, LG, Apple TV,
  Android TV, Docker, Synology, GitHub, Plex, Jellyfin, Emby; codecs and formats (HEVC, H.264, AV1, VP9, AAC, DTS, TrueHD, Atmos,
  HDR, HDR10, SDR, MKV, MP4, SRT, ASS); protocols and acronyms
  (HTTP, HTTPS, IP, URL, DNS, VPN, SSO, OIDC, NZB, RSS, API, CPU, GPU, QR, PIN,
  AI, Wi-Fi, LAN only inside a technical label). Keyboard layout names
  (AZERTY, QWERTY) and age-rating chips (*7+*, *13+*, as Apple's App Store
  writes them in China) stay as they are.
- **Dolby's Chinese brand names** in a sentence: *杜比视界* (Dolby Vision),
  *杜比全景声* (Dolby Atmos), as Apple and Dolby China write them. A format
  list generated by the server keeps whatever it sends.
- Keep every `{placeholder}` exactly as the source spells it, including
  repeats, and every piece of markup: `[KROMA]`, `*Settings*`, backticks,
  Markdown, HTML, URLs, `$t(...)`. A Markdown emphasis around Chinese still
  takes no inner space: `**设置**`.

## Fixed vocabulary

| English | Simplified Chinese | Never |
|---|---|---|
| Settings | 设置 | 设定, 配置 (for the screen) |
| Library | 媒体库 | 资料库, 图书馆, 库 alone |
| Media library | 媒体库 | |
| Movie | 电影 | 影片 for the type |
| Series | 剧集 | 系列 (a collection), 电视剧 in a label, 节目 |
| Collection (of movies) | 合集 | 系列 |
| Season | 季: *第 2 季*, *3 季* | 部 |
| Episode | 集: *第 3 集*, *12 集* | 话, 回 |
| Title (a movie or series) | 作品; counter 部 | 标题 (that is a heading), 片目 |
| Content | 内容 | |
| Play | 播放 | 玩, 开始 |
| Resume (a button) | 继续播放 | 恢复, 简历 |
| Continue Watching (a row) | 继续观看 | 继续看 |
| Pause / Stop | 暂停 / 停止 | |
| Play from the beginning | 从头播放 | 重新开始 |
| Next episode | 下一集 | |
| Skip intro / Skip credits | 跳过片头 / 跳过片尾 | 跳过介绍 |
| Subtitles | 字幕 | 副标题 |
| Audio | 音频 | 声音 (except the sound of a device) |
| Audio track | 音轨 | 音频轨道 |
| Dub, dubbed | 配音 | 译制 |
| Original version | 原声 | 原版 (for audio) |
| Quality (of the picture) | 画质 | 质量 |
| Resolution | 分辨率 | 解析度 |
| Bitrate | 码率 | 比特率 in a label |
| Codec | 编解码器; for one stream, 编码 | 编码器 |
| Transcode, transcoding | 转码 | 转换 (only when the source says convert) |
| Direct play | 直接播放 | 直放 |
| Remuxed, repackaged | 转封装 | 重新混流, remux |
| Stream (audio or video stream of a file) | 流: *音频流*, *视频流* | 串流 |
| Streaming (the act) | 播放, 在线播放 | 串流 |
| Buffering | 正在缓冲… | 缓存中 |
| Server | 服务器 | 伺服器 |
| Client | 客户端 | |
| Profile | 个人资料 | 档案, 配置文件 |
| Who's watching? | 谁在观看？ | |
| Account | 账户 | 帐户, 帐号, 账号 (pick one: 账户) |
| User | 用户 | 使用者 |
| Username | 用户名 | |
| Administrator, admin | 管理员 | 管理者, admin |
| Admin (the area) | 管理 | 后台, 控制台 |
| Owner (of the server) | 所有者 | 拥有者, 主人 |
| Dashboard | 仪表盘 | 控制面板 |
| Home | 首页 | 主页, 家 |
| Search (noun and verb) | 搜索 | 查找, 搜寻 |
| Discover | 发现 | 探索 |
| Browse | 浏览 | |
| My list | 我的片单 | 我的列表, 收藏夹 |
| Watchlist (titles to watch) | 片单 | 观看列表 |
| Favorites | 收藏 | 最爱 |
| Request (a title) | 请求 | 求片 (too colloquial) |
| Download / Upload | 下载 / 上传 | |
| Folder / File / Path | 文件夹 / 文件 / 路径 | 目录 (for a folder the reader picks) |
| Storage | 存储空间 | 储存 |
| Network | 网络 | |
| Local network, LAN | 局域网 | 本地网络, LAN in a sentence |
| LAN address | 局域网地址 | LAN 地址 |
| Remote access | 远程访问 | 远端访问 |
| Connection | 连接 | 联接 |
| Sign in / Sign out | 登录 / 退出登录 | 登陆, 注销, 登出 |
| Sign up, create an account | 注册, 创建账户 | |
| Signed out (a state) | 已退出登录 | 你已被登出 |
| Sign in failed | 登录失败 (status), 无法登录 (sentence) | |
| Invalid credentials | 用户名或密码不正确 | 凭据无效 |
| Password | 密码 | 口令 |
| Passkey | 通行密钥 | 密钥, Passkey |
| Security key | 安全密钥 | |
| PIN | PIN 码 | 密码 (a password is another thing) |
| One-time code | 一次性验证码 | 一次性代码 |
| Email | 电子邮件; the field, 电子邮件地址 | 邮件, email, 电邮 |
| Invitation / Invitation link | 邀请 / 邀请链接 | |
| Invite a user | 邀请用户 | |
| Permission, rights | 权限 | 许可 |
| Link / Unlink (a sign-in provider) | 绑定 / 解绑 | 链接, 关联 |
| Sign-in provider | 登录方式 | 身份提供商 (except in the SSO admin) |
| Identity provider (SSO admin, errors) | 身份提供商; group, 群组; group claim, 群组声明; scope stays Latin (*额外 scope*); redirect URI, 重定向 URI; client ID / secret, 客户端 ID / 客户端密钥 | 提供程序, 组 |
| AI model provider (Ollama, Anthropic) | 提供商 | 身份提供商 (that is sign-in) |
| Link a device, Quick Connect | 关联设备, 快速连接 | 链接设备 |
| Two-factor authentication | 双重认证 | 两步验证, 2FA |
| Recovery code | 恢复码 | 恢复代码 |
| Biometric unlock | 生物识别解锁 | |
| Module / Plugin | 模块 / 插件 | |
| Job, task | 任务 | 作业, 工作 |
| Queue / Queued (a stage) | 队列 / 排队中 | 在队列中 |
| Pipeline | 处理流程 | 管道, 管线 |
| Backup / Restore | 备份 / 恢复 | 还原 |
| Update (noun and verb) | 更新 | 升级 (except a major upgrade) |
| Update available | 有可用更新 | 有新版本 |
| Release (of the software) | 版本 | 发行 |
| Release (a torrent or an NZB) | 资源 | 发布, release |
| Release channel | 更新渠道 | 发布频道 |
| Version / Build | 版本 / 构建版本 | 建置 |
| Genre | 类型 | 流派 (that is music), 风格 |
| Director | 导演 | |
| Cast / Cast & crew | 演员 / 演职人员 | 卡司 |
| Actor | 演员 | |
| Rating (a score) | 评分 | 等级 |
| Age rating, maturity rating | 年龄分级; a short label, 分级: *分级：{label}* | 年龄等级 |
| Runtime | 时长 | 运行时间 (that is uptime) |
| Overview, synopsis | 简介 | 概述, 概览 |
| Trailer | 预告片 | 预告, 拖车 |
| Artwork | 图片 | 艺术作品, 封面 |
| Poster / Backdrop | 海报 / 背景图 | 背景 alone |
| Theme | 主题 | |
| Appearance | 外观 | |
| Dark / Light / System | 深色 / 浅色 / 跟随系统 | 暗色, 亮色, 黑暗模式 |
| Device | 设备 | 装置 |
| This device | 此设备 | 这个设备 |
| TV (the device) | 电视 | 电视机, TV |
| Session | 会话 | 会期 |
| Token | 令牌 | 代币, token |
| Log / Logs | 日志 | 记录 |
| Error | 错误 | |
| Warning | 警告 | |
| Success (a state) | 完成; 成功 in a job's status column | 成功 as a whole message |
| Failed (a state) | 失败 | |
| Loading | 正在加载… | 加载中… |
| None | 无 | 没有 |
| All | 全部 | 所有 (as a filter) |
| Unknown | 未知 | |
| On / Off (a switch's state) | 开 / 关 | 打开 / 关闭 as a state |
| Turn on / Turn off | 开启 / 关闭 | 打开 (for a setting) |
| Enable / Disable (a feature, a module) | 启用 / 停用 | 激活, 禁用 |
| Enabled / Disabled | 已启用 / 已停用 | 激活的 |
| Automatic | 自动 | |
| Custom | 自定义 | 定制 |
| Default (a value) | 默认 | 缺省 |
| Default (a track flag) | 默认 | |
| Optional | 可选 | 选填 |
| Required (a form field) | 必填 | 必需的 |
| This field is required | 此项为必填项 | |
| Use at least 8 characters, 8+ characters | 至少 8 个字符 | 8+ 字符 |
| Apply | 应用 | 套用 |
| Reset | 重置 | 复位 |
| Reset to defaults | 恢复默认设置 | |
| Save / Cancel | 保存 / 取消 | 储存 |
| OK | 确定 | 好的, OK |
| Done | 完成 | 已完成 on a button |
| Continue / Back / Next | 继续 / 返回 / 下一步 | 后退 |
| Close | 关闭 | |
| Retry, try again | 重试 | 再试一次 on a button |
| Delete / Remove | 删除 / 移除 | 清除 for delete |
| Clear (a field, a search, a PIN) | 清除 | 清空 for one field |
| Edit | 编辑 | 修改 on a button |
| Change (a password, a PIN) | 更改 | 改变 |
| Skip (a step) | 跳过 | 略过 |
| Set up, setup | 设置; the wizard, 设置向导 | 安装 (that is install) |
| Mute / Muted | 静音 / 已静音 | 无声 |
| Volume | 音量 | |
| Fullscreen | 全屏 | 全屏幕 |
| Picture in picture | 画中画 | |
| Playback speed | 播放速度 in settings; 倍速 on the player's own button, as Bilibili, iQIYI and Tencent Video label it | 速度 alone |
| Aspect ratio | 画面比例 | 纵横比 |
| Controls (of the player) | 播放控件 | 控制 |
| Timeline, scrub bar | 进度条 | 时间线, 时间轴 |
| Storyboard (seek previews) | 预览缩略图 | 故事板 |
| Subtitle delay | 字幕延迟 | |
| Sync | 同步 | |
| Bandwidth | 带宽 | 频宽 |
| Port / Port forwarding | 端口 / 端口转发 | 埠 |
| Host | 主机 | |
| Certificate | 证书 | 凭证 |
| Firewall | 防火墙 | |
| Torrent | 种子 | Torrent in a sentence, 洪流 |
| Seeding (a torrent) | 做种中 | 播种 |
| Seeders / Peers, the swarm | 做种者 / 节点; a count or its column, 做种数; leechers, 下载者 | 种子 for a person, 对等方 |
| Indexer | 索引器 | 索引站 |
| Usenet / NZB | Usenet / NZB | |
| Webhook | Webhook | 网络钩子 |
| Cache | 缓存 | 快取 |
| Snapshot | 快照 | |
| Migration | 迁移 | |
| Scan | 扫描 | |
| Metadata | 元数据 | 元资料 |
| Match (a title) / Rematch, fix the match | 识别 / 重新识别, 修正识别 | 匹配 on a button |
| Acquisition (the module) | 内容获取: *启用“内容获取”模块* | 采集, 获取 alone as the module's name |
| Content acquisition (the admin page) | 内容获取 | |
| Intro and credits detection | 片头片尾检测 | |
| Kill switch (VPN) | 断网保护 | Kill Switch, 终止开关 |
| Uptime | 运行时间: *已运行 {duration}* | 正常运行时间 |
| Last year (a time range) | 过去 12 个月 | 去年 |
| Top users | 最活跃的用户 | 顶级用户 |
| Theme song (of a series) | 主题曲 | 主题歌 |
| Mb/s | Mb/s, as the source writes it | Mbit/s |
| Tap to (on a phone) | 轻点…即可 | 点击, 触摸 |
| Press (on a remote) | 按 | 点击 |
| Select (on a television) | 选择 | 点击 |
| S1E3, Play S1E3 | S1 E3, 播放 S1 E3 | 第1季第3集 in a compact chip |
| 3 of 10 (a step, a page) | 第 3 步，共 10 步; 3/10 in a compact counter | 10 中的 3 |
| 1–50 of 200 (a page) | 第 1–50 项，共 200 项 | 1-50 / 200 |
| {count} item(s) | {count} 项 | 项目(们) |
| Text subtitles | 文本字幕 | 文字字幕 |
| Ready to watch (a notification) | 可以观看了 | 准备观看 |
| Critically acclaimed | 口碑佳作 | 广受好评的 |
| A-Z (a sort) | 按名称 | A-Z |
| AI suggestions | AI 推荐 | 人工智能建议 |
| e.g. | 例如 | 例：, e.g. |
| Blocklist | 屏蔽列表 | 黑名单 |
| Supervise (a process) | 监控 | 监督 |
| Media items (a count) | 部作品 | 媒体项目 |
| Feature | 功能 | 特性 |
| Roku (the device) | Roku 设备 | Roku 们 |
| At any time | 随时 | 任何时候 |
| Has already been used (a link, a code) | 已被使用 | |
| Expired | 已过期 | 过期了 |
| Notification | 通知 | 提醒 (that is a reminder) |
| Preferences | 偏好设置 | 首选项 (Windows), 喜好 |
| Interface language | 界面语言 | 用户界面语言 |
| Avatar / Profile photo | 头像 | 化身, 个人照片 |
| Member since | 加入于 {date} | 会员自 |
| Active (a session) | 活跃 | 激活 |
| User agent | 用户代理 (User-Agent) | |
| Online / Unreachable (a server) | 在线 / 无法访问 | 可达, 不可达 |
| Personal information | 个人信息 | 个人资料 (that is the profile) |
| QR code | 二维码 | QR, QR 码 |
| Scan (a QR code) | 扫描, 扫码 | |
| Cast (to a TV), casting | 投屏, 在电视上播放 | 投射, 串流 |
| Remote (control) | 遥控器 | 远程 |
| Episodes (the list on a series page) | 选集, as Chinese streaming apps write it; 分集 in a sentence | 剧集 (that is a series) |
| For you (a row) | 为你推荐 | 给你 |
| Featured | 精选 | 特色 |
| Studios | 制作公司 | 工作室 |
| Mark as watched / unwatched | 标记为已看 / 未看 | 已观看 |
| Because you watched {title} | 因为你看过《{title}》 | |
| Directed by {name} (a row) | {name}执导 | 由 {name} 导演 |
| Any language (a filter) | 不限语言 | 任何语言 |
| Release date (a sort) | 上映日期 | 发布日期 |
| Sort by | 排序方式 | 排序依据 |
| Unsaved changes | 有未保存的更改 | 未保存的变更 |
| Reload (a page) | 重新加载 | 刷新 (fine in a sentence) |
| (beta) | （测试版） | （beta） |
| Space (the key) | 空格 | 空间 |
| Placeholder of an address field | 例如：example.kroma.net | the bare English example |
| Media details (the file's codecs) | 文件详情 | 媒体详情 |
| Container (MKV, MP4) | 封装格式 | 容器 |
| 10-bit | 10 位 | 10 bit, 10 比特 |
| Image subtitles (PGS) / Text subtitles | 图形字幕 / 文本字幕 | 图像字幕 |
| Read more / Show less | 展开 / 收起 | 阅读更多 |
| Known for | 代表作 | 知名作品 |
| Filmography | 影视作品 | 作品年表 |
| Creator (of a series) | 主创 | 创作者 |
| Downloads (offline) | 下载内容 | 下载 alone as a title |
| Your space (the personal tab) | 我的 | 你的空间 |
| Back (the remote key) | 返回键 | 后退键 |
| OK (the remote key) | OK | 确定键 |
| Sound mode (Off, Standard, Night, Boost) | 声音模式: 关, 标准, 夜间模式, 增强 | 音频滤镜 |
| Back 10 s / Forward 10 s | 后退 10 秒 / 快进 10 秒 | 返回 10 秒 |
| Restart (a title) | 从头播放 | 重新启动 |
| Real-time activity | 实时动态 | 实时活动 |
| Something went wrong | 出了点问题 | 发生了错误 |
| Skip recap | 跳过前情提要 | 跳过回顾 |
| Subtitle edge styles | 无, 凸起, 凹陷, 均匀, 投影, as Apple's caption settings | 阴影 for drop shadow |
| Transcribe / Translate (a subtitle) | 转写 / 翻译 | 转录 |
| Fill screen / Fit to screen | 填满屏幕 / 适应屏幕 | 拉伸 |
| Title (the field of a work's name) | 片名; original title 原片名; sort title 排序名称 | 标题 |
| Tagline | 宣传语 | 标语 |
| A list typed into a field | 用英文逗号分隔: the editor splits on the ASCII comma only | 用逗号分隔 alone, which invites ， |
| A genre name TMDB translates (剧情, 悬疑, 纪录) | TMDB's zh-CN name, exactly as TMDB spells it | a rewrite: KROMA matches stored genres against these labels as spelled |
| A genre TMDB may still send in English (Sci-Fi & Fantasy, War & Politics) | a Chinese label of the same shape: 科幻奇幻, 战争政治 | |
| `vocab.*` (words the server recognises in queries and synopses) | comma-separated Chinese words, ASCII commas; `vocab.numbers` is exactly nine, 二 to 十; `vocab.articles` and `vocab.abbreviations` are left out, since Chinese has neither | full-width ， |
| Feel-good, mind-benders (themed rows) | 治愈系, 烧脑神作: the words Chinese viewers use for these rows | a literal rendering |
| Face ID / Touch ID | 面容 ID / 触控 ID, as Apple China writes them | Face ID, 人脸识别 |
| Profile lock | 个人资料锁 | 资料锁定 |
| Report (a problem a viewer sends) | 问题反馈 | 报告 alone, 举报 |
| Shared device (a TV the household uses) | 共用设备 | 共享设备 |
| Public address (of a server) | 公网地址 | 公共地址 |
| Country (a setting) | 国家或地区 | 国家 alone |
| Password strength | 弱 / 一般 / 良好 / 强 | |
| Member since {date} | 加入时间：{date} | 自 {date} 起成为会员 |

## Terms of the administration

| English | Simplified Chinese | Never |
|---|---|---|
| Monitored (a title the acquisition follows) | 追踪的作品, 追踪 | 监控 (that is monitoring), 关注 |
| Watch list, wanted list (titles to fetch) | 追踪列表 | 愿望清单 |
| Grab (a release) | 获取 | 抓取, 抢 |
| Upgrade (a file to a better copy) | 升级, 更好的版本 | 提升 |
| Quality profile | 质量配置 | 质量档案 |
| Tracker (a torrent site) | 站点; private / semi-private / public: 私有 / 半私有 / 公开站点 | Tracker in a sentence, 追踪器 |
| Tracker catalog | 站点目录 | |
| Torznab feed | Torznab 源 | Torznab 订阅 |
| Recycle bin | 回收站 | 垃圾桶 |
| Stalled (a download) | 停滞 | 卡住 |
| Cron expression | Cron 表达式 | |
| Scheduled (a job, a backup) | 定时: *定时备份*; a job's schedule, 计划 | 预定 |
| Maintenance | 维护 | |
| Write-ahead log (SQLite) | 预写日志 | WAL 日志 |
| Relay (the kroma.tv mail or push relay) | 中继 | 转发器 |
| Allowed on the relay (a server) | 已获中继许可 | 中继已允许 |
| The relay's question (the email asking to allow a server) | 中继的确认邮件: *中继的确认邮件已发送到 {email}*; its button, “允许此服务器” | 中继授权请求, 中继的问题 |
| Mail server | 邮件服务器 | 邮箱服务器 |
| SMTP | SMTP | |
| Middleware (modules that filter connections) | 连接过滤模块 | 中间件 |
| Television (a kind of device) | 电视 | 电视机 |
| Config (a WireGuard file) | 配置文件 | config |
| Discard your changes? | 要放弃更改吗？ | 要丢弃修改吗？ |
| No account with us (the project) | 无需注册 KROMA 账户 | 无需在我们这里注册 |
| Not even us | 连 KROMA 也不能 | 连我们也不能 |
| est. (estimated) | 预计 | 估 |
| Create their account (one person) | 创建账户 | 创建他们的账户 |
| The server's database | 服务器数据库 | 服务器 DB |
| Go on the internet (a module's access) | 访问互联网 | 上网 |
| Whoever publishes it (a module) | 发布者 | 谁发布它 |
| Console (the admin area) | 管理 | 控制台 |
| Imported (a play) | 已导入 | |
| Remote access (the module) | 远程访问 | 远端访问 |
| Issuer (OpenID Connect) | 颁发者 | issuer, 发行人 |
| ID token | ID 令牌 | ID token |
| Library manager (the role) | 媒体库管理员 | |
| Repository (source code) | 代码仓库 | 存储库 |
| Branch / Commit | 分支 / 提交 | |
| Build (local, a version) | 构建: *本地构建*, *构建版本*, *构建时间* | 编译 alone, 建置 |
| Cores (CPU) | 核: *8 核* | 核心 |
| Memory | 内存 | 记忆体 |
| Logo (an artwork kind) | 标志 | 徽标, Logo |
| Thumbnail (an episode still) | 缩略图 | 剧照 |
| Ignore this email: nothing changes | 请忽略此邮件，一切照旧 | 什么都不会改变 |
| Preheader (an email's preview line) | the line itself, short: *只需一步即可确认地址。* | |
| Subject line with the server's name | *重置密码 · {name}* | |
| Command menu (⌘K) | 快速访问; its search, 全局搜索 | 命令面板 |
| Host updater | 主机更新程序 | 主机更新器 |
| Probing (a file) / Enrichment (metadata) | 文件分析 / 元数据补全 | 探测, 丰富 |
| Incremental / resumable (a job) | 增量处理 / 可续传 | 递增 |
| Embedding (recommendations) | 向量 in a job or a stage: *内容向量*, *重新计算推荐向量*; the technical name (a cache, the website), 嵌入向量; the model, 嵌入模型 | 嵌入 alone, 嵌入式 |
| Fingerprint (audio, picture) | 指纹 | |
| Loudness (EBU R128) | 响度 | 音量 (that is the player's volume) |
| Demux | 解封装 | 解复用 |
| Digest (of new arrivals) | 汇总: *新内容汇总* | 摘要 |
| Collections, sections (home rows built by the server) | 合集, 栏目; a row of posters, 推荐行 | 部分, 区块 |
| Franchise | 系列 (a film franchise is 系列 in Chinese) | 特许经营 |
| Job status | 正在运行 / 成功 / 失败 / 已取消: a run's status column may say 成功 | |
| Job trigger | 手动 / 定时 / 链式触发 / 文件变化 | |
| Last / Next (a job's runs) | 上次 / 下次 | 最后 / 下一个 |
| Language names (`lang.*`) | CLDR's zh names, as `Intl.DisplayNames('zh-Hans')` gives them, with regional variants written as one name: 拉丁美洲西班牙语, 加拿大法语, 法国法语, 巴西葡萄牙语, 欧洲葡萄牙语 | 法语（法国） in a list beside 加拿大法语 |
| Module permissions: read / change | 读取 / 修改; read only 只读, read and change 读取和修改 | 写入 for change |
| Extended access (a module past its isolation) | 扩展权限 | 扩展访问 |
| Isolated (a module) | 隔离 | 沙盒 |
| Make itself known (mDNS) / Look for devices (SSDP) | 通告自身 / 查找设备 | 广播自己 |
| Incoming connections | 传入连接 | 入站连接 |
| A tracker in the BitTorrent protocol sense (announce) | Tracker 服务器 | 站点 (that is a torrent site) |
| Peers (BitTorrent) | 节点 | 对等方 |
| Tunnel (VPN) | 隧道 | 通道 |
| Open source licenses / package | 开源许可证 / 软件包 | 授权, 包 |
| Follow (live logs) | 实时跟踪 | 关注 |
| Log levels | 全部 / 信息 / 警告 / 错误 | |
| Tastes (an account's) | 观看偏好 | 品味 |
| A list joined in a sentence | `{head}和{last}`: the code joins the head with ", " | 以及 |
| Turned on / turned off (a module, a toast) | 已启用“{name}” / 已停用“{name}” | {name} 已打开 |
| Registry (where modules install from) | 模块源; the official one, 官方模块源; what a registry serves, 模块目录 | 注册表, 仓库 |
| Store (the in-app module store) | 商店 | 应用商店 (that is Apple's or Google's) |
| Block (a connection) / Direct (send it outside the VPN) | 阻止: *已阻止 {count} 个* / 直连 | 封锁, 直接 |
| Follow / unfollow (a title, monitoring) | 追踪 / 取消追踪; toasts 已开始追踪 / 已取消追踪 | 关注 |
| On the way (grabbed, not yet imported) | 正在获取 | 在路上 |
| Air status of a series | 制作中, 筹备中, 后期制作中, 已上映, 将回归, 已公布, 已完结, 已取消 | 回归中 |
| Specials (season 0) / Pilot | 特别篇 / 试播集 | 特辑 |
| Preset | 预设 | 预置 |
| Undo | 撤销 | 取消 |
| Home release (a film's digital release) | 数字版发行时 | 家庭发行 |
| Caller (a module calling another) | 调用方 | 呼叫者 |
| Point (what a module answers or calls: `network-policy`, `acquisition`) | 扩展点. A module defines (定义), answers (提供) or calls (调用) one; who answers, 提供方; who calls, 调用方; unanswered, 无提供方: *提供 network-policy 扩展点的模块* | 点, 接入点; 响应 for answering a point |
| Kids profile | 儿童个人资料 | 儿童档案, Kids 个人资料 |
| Profile picker | 个人资料选择页 | 选择器 |
| Who (column: KROMA or a module opening a connection) | 发起方 | 谁 |
| Network page tabs | 连接 / 目标 / 传入连接 / 监听 / 连接过滤 / 规则 / 设置 | 中间件 |
| Route (direct, VPN, blocked) / Via (internet, LAN, tunnel) | 直连 / VPN / 已阻止; 互联网 / 局域网 / 隧道 | |
| Rule action / Verdict | 动作 / 结果: 已允许, 已阻止 | 判决 |
| Through the VPN | 经由 VPN | 通过 VPN 走 |
| Rule N (a numbered rule) | 规则 {position}: *上移规则 {position}* | 第 N 号规则 |
| Stay (leave dialog's cancel) | 继续编辑 | 留下 |
| Archive (a notification) / inbox | 归档 / 收件箱 | 存档 |
| Kinds of notification | 类: *{count} 类*, *各类通知* | 种类型 |
| Push delivery states | 已送达 / 失败 / 已静音 / 已暂缓 / 设备已移除 | 已节流 |
| Episode arrival | *《{title}》{episode} 已上线。* *《{title}》更新了 {count} 集。* | 可用 |
| Element (what the pipeline tracks: a film, an episode, a show) | 条目; a type label for an episode, 分集 | 元素 |
| Pipeline stages | 文件分析 / TMDB / 预览缩略图 / 字幕 / 片头片尾 / 片尾 (a film's credits) / 向量 | |
| Up to date / Queued / Needs action | 已是最新 / 排队中 / 需处理 | 最新的 |
| Measuring (performance) | 测量; instrumented function, 插桩函数 | 剖析, 分析 |
| Full scan / Missing index / Query in a loop | 全表扫描 / 缺少索引 / 循环内查询 | N+1 in a label |
| Settled (a notification someone acted on) | 已处理; by someone, 已由“{user}”处理 | 已解决 (that is a resolved report) |
| Approve / Deny (a request) | 批准 / 拒绝; result, 请求已批准 / 请求被拒绝 | 同意 |
| Add to Home Screen (iOS) | 添加到主屏幕 | 主画面 |
| Report statuses and actions (admin) | 待处理 / 已解决 / 已关闭; 标为已解决, 关闭 (dismiss), 重新打开 | 驳回, 忽略 |
| Reporter / Requester | 反馈者 / 请求者 | 报告人 |
| The selection, N picked | 所选的 {count} 项: *请求所选的 {count} 项* | 选择, {count} 已选 |
| Interactive search (pick a release by hand) | 交互式搜索 (the on-demand job is 手动搜索) | |
| Free search | 自由搜索 | |
| What's new (release notes) | 更新内容; a version's fixes, *{count} 项修复*, *{count} 项新功能* | 新增功能 alone |
| Fix the match (TMDB) | 修正识别; confidence, *置信度 {score}%* | 匹配 |
| A path through the interface | “管理”>“模块”, each step quoted, as Apple writes 前往“设置”>“通用” (the website keeps its → between quoted steps) | Admin, Modules; 管理 › 模块; “管理 > 模块” in one pair of quotes |
| Status chip of a running state | …中: 下载中, 导入中, 搜索中, 运行中, 做种中 (a sentence or a progress line keeps 正在……) | 正在下载 on a chip |
| Import from Plex / Jellyfin (setup) | 迁移 for what comes over (*不会迁移的内容*), 导入 for the action (*开始导入*) | 移民 |
| Sign-in kept to import again | 登录信息: *删除此登录信息* | 忘记此登录 |
| Setup wizard | 设置向导; its steps, 设置步骤 | 安装向导 |
| Hello (the first screen) | 你好。 | 您好 |
| Acquisition, Sonarr-like terms | quality 质量 (not 画质 here); quality profile 质量配置, 配置 in its own page; quality ladder 质量等级; custom format 自定义格式; cutoff 升级目标; upgrade until 升级至; release group 发布组; edition 剪辑版本; revision 修订版; season pack 整季包; ratio 分享率 | 画质 for a release's quality, 截止 |
| Indexer flags | 免费 (freeleech), 50% 免费, 双倍上传, 内部, Scene | 自由下载 |
| A tracker's page for a release | 站点页面: *在站点上查看* | 追踪器页面 |
| French dub tags (VFF, VFQ, VO) | the tag in parentheses after the name: *法国法语（VFF）*, *魁北克法语（VFQ）*, *原始语言（VO）* | 法语，法国 |
| Package Center (Synology DSM) | 套件中心; package source 套件来源; Add 新增; the Community tab 社群; manual install 手动安装, as DSM's Chinese says | 软件包中心 |
| Raspberry Pi | 树莓派 | Raspberry Pi in a sentence |
| Roku channel (an app on Roku) | 频道, Roku's own word | 应用 |
| Naming tokens (file templates) | 变量 | 令牌 |
| Stream copy (transcode monitor) | 直接复制: *视频直接复制* | 流复制 |
| Status chip of a session or a phase | 播放中 / 已暂停 / 缓冲中; 等待中 / 下载中 / 安装中 / 已安装 | 正在播放 on a chip |
| Optional (a field label) | （选填）: *消息（选填）*; a badge or a hint's first word, 可选 | （可选） in a label |
| Sealed (a VPN tunnel that lets nothing leak) | 生效: *隧道已生效 · 出口 IP {ip}*, *隧道桥接未生效期间* | 封闭 |
| Kill switch engaged | 断网保护已触发 | 已启用 (that is the setting) |
| A toast about one title (admin) | 已 + verb, the title in 《》: *已批准《{title}》的请求*, *已开始追踪《{title}》*; a stage name in “”: *已重新开始“{stage}”* | “{title}”已批准 |
| The website (www) | 我们 allowed where the team speaks (privacy, support), never in the product; a path keeps the site's arrow with each step quoted, *“管理”→“模块”*; macOS's own path, *苹果菜单 >“关于本机”* | |

## Calques to avoid

| Written | Why it is wrong | Write |
|---|---|---|
| 你的媒体库，在家中 | English possessive and word order | 家里的影音，随时观看 |
| 您 | stiff, and breaks the one voice | 你, or nothing |
| 你的设置已被成功保存 | possessive, 被 passive, *successfully* | 已保存 |
| 文件被服务器扫描 | English passive with 被 | 服务器会扫描文件 |
| 对文件夹进行扫描 | 进行 + noun, the officialese of a translated manual | 扫描文件夹 |
| 一个新的版本 | the English article | 新版本 |
| 当你选择一个文件时 | *when you…*, pronoun, article | 选择文件后 |
| 这允许你… | *this allows you to* | 可以…, 用于… |
| 通过使用… | *by using* | 用…, 使用… |
| 在…的情况下 | *in the case of*, a long frame for 如果 | 如果… |
| 关于…的 | *about* | drop it, or 的 |
| 我们无法… | the product says *we* | 无法… |
| 请您… | doubled politeness | 请… once, or nothing |
| 加载中… | a progress label in the English order | 正在加载… |
| 失败了！ | an exclamation and a particle | 失败 |
| 你确定吗？ | *Are you sure?* word for word | 要删除此项吗？ |
| 获取更多出你的媒体库 | *get more from* | 更好地使用媒体库 |
| 它就是能用 | *it just works* | 开箱即用 |
| 消费内容 | *consume media* | 观看 |
| 增强你的观看体验 | marketing filler | 看得更舒服 |
| 一切都在一个地方 | *everything in one place* | 电影和剧集，尽在一处 |
| 你已经准备好了 | *you're all set* | 设置完成 |
| 被计算在内 | *be counted* | 匿名统计 |
| 服务器在等待 | the server as a person | 等待服务器响应 |
| 点击这里 | *click here* on a TV | 选择…, 按… |
| 错误：找不到文件 | a colon after 错误 | 找不到文件。 |
| 3 个结果(们) | an English plural | 3 个结果 |

## Plurals

CLDR gives Chinese one category, `other`. Write the bare key only, never a
suffix: the counter does the work (*{count} 季*, *{count} 集*, *{count} 部作品*).
`_zero` exists in every language; write one only where the source has one and
a zero sentence reads better (*没有结果*).

Counters this product needs:

| Thing | Counter | Example |
|---|---|---|
| Movie, series, title | 部 | *5 部电影*, *3 部剧集*, *12 部作品* |
| Season | 季 | *3 季* |
| Episode | 集 | *24 集* |
| Person, user | 位 for people named, 个 for a count of accounts | *3 位演员*, *4 个用户* |
| Device, server | 台 | *2 台设备*, *1 台服务器* |
| File, folder, item, result | 个 | *8 个文件*, *3 个结果* |
| Message, record, log line | 条 | *20 条记录* |
| Image | 张 | *4 张图片* |
| Language, track | 种 / 条 | *3 种语言*, *2 条音轨* |
| Time | no counter | *10 秒*, *5 分钟*, *2 小时*, *3 天* |

## One screen, one thing to know

Chinese makes a long English hint shorter, not longer. Keep the one fact the
reader needs to act now; move the rest to the screen where it matters.

## Turns that make Chinese sound Chinese

- *即可* for "and that's it": *选择文件夹即可开始。*
- *暂无* and *还没有* for an empty state: *暂无通知*, *还没有作品。*
- *已* for a result, *正在* for progress, *将* for what will happen.
- *要…吗？* for a confirmation title: *要退出登录吗？*
- *按…* for *by*: *按名称排序*, *按设备*.
- *每个…* for *each*: *每个文件夹对应一个媒体库*.
- *无需* for *you do not need to*: *无需注册账户。*
- A comma joins two short English sentences when they are one thought:
  *选择服务器，然后用快速连接关联个人资料。*
