# Vietnamese

What Vietnamese software says, and how. Read it before you write a Vietnamese
string.

## Register

- **bạn** when a pronoun is needed, as Netflix, YouTube, Google and Apple write
  Vietnamese. Polite and plain, never familiar (*mày*, *cậu*) and never stiff
  (*quý khách*, *quý vị*). Most strings need no pronoun at all: Vietnamese drops
  the subject and the possessive where English keeps them. *Nhập mật khẩu*, not
  *Nhập mật khẩu của bạn*.
- **của tôi** only where the reader names their own space, as Netflix does:
  *Danh sách của tôi*, *Yêu cầu của tôi*, *Hồ sơ của tôi*. A button that speaks
  for the reader drops it: *Tạo tài khoản*, not *Tạo tài khoản của tôi*.
- The product does not say **chúng tôi** about itself. Say *KROMA*, or make the
  thing the subject: *Máy chủ đang cập nhật*.
- Instructions are **plain imperatives**: *Nhập mã PIN*, *Thử lại sau*, *Kiểm tra
  kết nối mạng*. *Hãy* softens one that opens a sentence and would read as an
  order: *Hãy thử lại sau ít phút.* Never *vui lòng* or *xin*: they stack
  politeness and read like a call-centre script.
- Short sentences, one idea each. A Vietnamese sentence usually needs no more
  words than the English; where the English uses two sentences, a comma or *rồi*
  often joins them.

## The form of each kind of string

| Kind | Form | Example |
|---|---|---|
| Button | verb or verb phrase | *Lưu*, *Hủy*, *Phát*, *Thử lại*, *Thêm hồ sơ* |
| Toggle, option | noun or adjective | *Bật*, *Tắt*, *Tự động*, *Mặc định* |
| Screen title | noun phrase, or a question | *Cài đặt thiết bị*, *Ai đang xem?*, *Thoát KROMA?* |
| Work in progress | *Đang* + verb + `…` | *Đang tải…*, *Đang lưu…*, *Đang quét thư viện…* |
| Result | *Đã* + verb | *Đã lưu*, *Đã sao chép*, *Đã thêm vào danh sách của tôi.* |
| Error | *Không thể* + verb, then what to do | *Không thể kết nối với máy chủ. Kiểm tra mạng rồi thử lại.* |
| What a device cannot do | verb + *không … được* | *Thiết bị này không phát được AV1*, *Không mở được tệp này* |
| Not found | *Không tìm thấy* + noun | *Không tìm thấy thư viện* |
| Empty state | *Chưa có … nào*, then the way out | *Chưa có phim lẻ nào trong thư viện.* |
| Hint | a full sentence with its full stop | *Mỗi thư mục là một thư viện.* |
| Count | number + noun, no plural | *{count} tập*, *{count} phần*, *3 thư viện* |

Never *thất bại* as the whole error sentence: *Đăng nhập thất bại* is a status,
the sentence is *Không thể đăng nhập*. A status label in a list may use
*Không thành công*.

## Typography

- Unicode **NFC**: every vowel with its tone mark is one precomposed character.
  Never a combining mark typed after the letter.
- Tone marks in the **traditional placement** that Apple, Google and Microsoft
  use: *hủy*, *tùy chọn*, *hòa*, *thủy*, *khỏe*. Not *huỷ*, *tuỳ*, *hoà*.
- *y* after *k, l, m, t* in the usual software spellings: *kỹ thuật*, *quản lý*,
  *lý do*, *mỹ thuật*.
- No space before `.` `,` `:` `;` `!` `?`; one space after.
- One character for the ellipsis: `…`.
- `·` with a space on each side for metadata: *Tiếng Pháp · 5.1 · EAC3*.
- Quotation marks: `“ ”`, `‘ ’` inside them.
- Numbers: decimal comma, dot for thousands: *1,5 GB*, *10.000*. The project's
  formatter writes them; a number written in a string follows the same rule.
- A space between a number and its unit: *10 giây*, *5 phút*, *4 chữ số*,
  *512 × 512*. No space before `%`: *50%*.
- Time units in full words: *giây*, *phút*, *giờ*, *ngày*. No *s*, *min*, *h*.
- Sentence case. Only the first word and proper names take a capital, in titles
  and buttons too. A language name takes a capital on *Tiếng* in a list or at the
  start of a label (*Tiếng Anh*), and is lowercase inside a sentence (*âm thanh
  tiếng Anh*).
- Stay Latin and unchanged: KROMA, TMDB, Tizen, webOS, Roku, Samsung, LG,
  Docker, Synology, GitHub, YouTube, Whisper, App Store, Google Play, Face ID,
  Touch ID; HEVC, H.264, H.265, AV1, VP9, AAC, DTS, TrueHD, Atmos, HDR, Dolby
  Vision, NZB, RSS, VPN, SSO, SQL, HTTP, HTTPS, URL, IP, API, GPU, CPU, QR,
  PIN, AI, 4K.
- A word, not a symbol: *và*, *hoặc*. Not `+`, `/` or `&` (except inside a
  genre name TMDB spells that way, or a name such as *Face ID / Touch ID* that
  the platform writes so).
- Keep every `{placeholder}` exactly as the source spells it, including repeats.
- Keep markup exactly: `[KROMA]`, `*Settings*`, backticks, Markdown, HTML, URLs,
  `$t(...)`.

## Fixed vocabulary

| English | Vietnamese | Never |
|---|---|---|
| Settings | Cài đặt | Thiết lập, Thiết đặt |
| Preferences | Tùy chọn | Ưu tiên |
| Library | Thư viện | Kho |
| Media library | thư viện phim | thư viện media |
| Movie (a kind, the nav entry) | Phim lẻ | Phim điện ảnh, Movie |
| Movie (in a sentence) | phim | |
| Series, show | Phim bộ | Chương trình truyền hình, show, loạt phim |
| Season | Phần | Mùa, Season |
| Episode | Tập | Episode |
| Title (a movie or series) | phim | tiêu đề, tựa đề |
| Title (the field, a name) | Tên phim | Tiêu đề |
| Sort title | Tên để sắp xếp | |
| Content | Nội dung | |
| Play | Phát | Chơi, Play |
| Resume, continue watching | Xem tiếp | Tiếp tục xem (both are right; this one is shorter and keep it) |
| Resume (a download, a slideshow) | Tiếp tục | |
| Restart (a title) | Xem từ đầu | Khởi động lại |
| Pause | Tạm dừng | |
| Stop | Dừng | |
| Rewind / Forward | Tua lại / Tua tới | Quay lại |
| Skip intro / Skip recap | Bỏ qua giới thiệu / Bỏ qua tóm tắt | Skip |
| Up next | Tiếp theo | |
| Next episode | Tập tiếp theo | Tập kế tiếp |
| Subtitle | Phụ đề | Sub |
| Forced (subtitle) | Bắt buộc | Cưỡng bức |
| Audio | Âm thanh | Audio |
| Audio track | Bản âm thanh | Track âm thanh, Rãnh âm thanh |
| Dub, dubbed | Lồng tiếng | |
| Quality | Chất lượng | |
| Resolution | Độ phân giải | |
| Bitrate | Tốc độ bit | Bitrate |
| Codec | codec | bộ mã hóa |
| Transcode, convert | chuyển mã | transcode |
| Direct play | phát trực tiếp | direct play |
| Stream, streaming | phát trực tuyến; *luồng* for one stream | stream |
| Buffering | Đang tải dữ liệu… | Đang đệm, Buffering |
| Server | Máy chủ | Server |
| Client (the app) | Ứng dụng | Máy khách |
| Profile | Hồ sơ | Profile |
| Account | Tài khoản | |
| User | Người dùng | User |
| Administrator, admin | Quản trị viên | Admin |
| Owner (of the server) | chủ sở hữu máy chủ | chủ máy chủ, chủ server |
| Home | Trang chủ | Nhà |
| Search | Tìm kiếm | Tra cứu |
| Discover | Khám phá | |
| Genre | Thể loại | |
| My list | Danh sách của tôi | Danh sách yêu thích |
| Favorites | Yêu thích | |
| Request | Yêu cầu | Đề nghị |
| Download / Upload | Tải xuống / Tải lên | Download, Upload |
| Folder | Thư mục | Folder |
| File | Tệp | File |
| Path | Đường dẫn | |
| Storage | Bộ nhớ | |
| Network | Mạng | |
| Local network, LAN | mạng nội bộ | mạng LAN |
| Remote access | Truy cập từ xa | |
| Connection | Kết nối | |
| Online / Offline | Trực tuyến / Ngoại tuyến | Online, Offline |
| Unreachable | Không kết nối được | |
| Sign in / Sign out | Đăng nhập / Đăng xuất | Login, Logout |
| Sign up, register, create an account | Tạo tài khoản; Đăng ký for the act | |
| Password | Mật khẩu | Pass |
| Username | Tên người dùng | Username |
| PIN | mã PIN | PIN alone in a sentence |
| Passkey | Khóa truy cập | Passkey, Mã khóa |
| Security key | khóa bảo mật | |
| Biometric unlock | Mở khóa sinh trắc học | |
| Email | Email; *địa chỉ email* in a sentence | Thư điện tử, E-mail |
| Invitation | Lời mời | |
| Invitation link | Đường liên kết mời | |
| Link (a URL) | đường liên kết | link |
| Link / Unlink (a sign-in provider) | Liên kết / Hủy liên kết | Nối |
| Sign-in provider | Dịch vụ đăng nhập | Nhà cung cấp danh tính |
| Quick Connect | Kết nối nhanh | Quick Connect |
| Connect a device | Kết nối thiết bị | |
| Permission, rights | Quyền | Phân quyền |
| Session | Phiên | Session |
| Device | Thiết bị | |
| This device | Thiết bị này | |
| TV (the device) | TV | Tivi, Ti vi, Truyền hình |
| Phone | Điện thoại | |
| Browser | Trình duyệt | |
| Remote (the control) | Điều khiển | Remote |
| Cast, play on TV | Phát trên TV; Truyền for the act | Cast |
| Module | Mô-đun | Module |
| Plugin | Tiện ích bổ sung | Plugin |
| Job, task | Tác vụ | Job |
| Queue | Hàng đợi | Queue |
| Queued (a stage) | Đang chờ | Trong hàng đợi |
| Pipeline | Quy trình xử lý | Pipeline |
| Backup / Restore | Sao lưu / Khôi phục | Backup |
| Update | Cập nhật | Update |
| Update available | Có bản cập nhật | Cập nhật có sẵn |
| Release (software) | Bản phát hành | Release |
| Release (a torrent or an NZB) | bản phát hành | release |
| Version | Phiên bản | |
| Build | bản dựng | build alone |
| Build number | bản dựng {build} | |
| Release channel | Kênh phát hành | |
| Director | Đạo diễn | |
| Directed by | Đạo diễn | Được đạo diễn bởi |
| Cast (the people) | Diễn viên | Dàn cast |
| Actor | Diễn viên | |
| Creator | Nhà sáng tạo | |
| Writer | Biên kịch | |
| Known for | Nổi tiếng với | Được biết đến với |
| Filmography | Danh sách phim | Phim ảnh học |
| Rating (stars, score) | Điểm đánh giá; *Đánh giá* for a sort | |
| Age rating | Độ tuổi phù hợp; *Phân loại độ tuổi* for the setting | |
| Rated {label} | Độ tuổi: {label} | Được xếp hạng |
| All ages | Mọi lứa tuổi | |
| Runtime, duration | Thời lượng | |
| Overview, synopsis, summary | Tóm tắt; *Nội dung* on a detail page | Tổng quan |
| Tagline | Khẩu hiệu | Tagline |
| Trailer | Trailer | Đoạn giới thiệu, which clashes with *giới thiệu* (the intro) |
| Artwork | Hình ảnh | Artwork |
| Poster | Poster | Áp phích |
| Backdrop | Ảnh nền | |
| Theme (light, dark) | Giao diện | Chủ đề |
| Theme music (of a series) | Nhạc nền | Nhạc chủ đề |
| Appearance | Giao diện | |
| Dark / Light / System | Tối / Sáng / Theo hệ thống | |
| Dashboard | Bảng điều khiển | Dashboard |
| Session (signed-in device) | Phiên đăng nhập | |
| Token | Mã thông báo | Token alone |
| Log, logs | Nhật ký | Log |
| Error | Lỗi | |
| Warning | Cảnh báo | |
| Success, done | Xong, Hoàn tất | Thành công as a sentence |
| Failed (a status) | Không thành công | Thất bại as a whole sentence |
| Loading | Đang tải… | Loading |
| None | Không có | Không |
| All | Tất cả | |
| Unknown | Không xác định | Không biết |
| Enabled / Disabled | Đang bật / Đang tắt | Kích hoạt / Vô hiệu hóa (outside an admin rule) |
| On / Off | Bật / Tắt | On / Off |
| Automatic, auto | Tự động | Auto |
| Custom | Tùy chỉnh | Custom |
| Default | Mặc định | |
| Default (a track flag) | Mặc định | |
| Optional | Không bắt buộc | Tùy chọn, which is *Preferences* |
| Required | Bắt buộc | Yêu cầu |
| Apply | Áp dụng | |
| Reset | Đặt lại | Reset |
| Continue (a flow) | Tiếp tục | |
| Next / Previous (a step, a page) | Tiếp / Trước | Kế tiếp |
| Done (a button) | Xong | Hoàn thành |
| Back | Quay lại | Trở về |
| Cancel | Hủy | Huỷ, Bỏ |
| Close | Đóng | |
| Delete / Remove | Xóa / Gỡ (from a list: Xóa khỏi) | Loại bỏ |
| Clear (a field, a search) | Xóa | Làm trống |
| Copy / Copied | Sao chép / Đã sao chép | Copy |
| Save / Saved | Lưu / Đã lưu | |
| Try again | Thử lại | |
| Manage | Quản lý | |
| Mute / Unmute | Tắt tiếng / Bật tiếng | Câm |
| Volume | Âm lượng | |
| Fullscreen | Toàn màn hình | |
| Picture in picture | Hình trong hình | PiP |
| Playback speed | Tốc độ phát | |
| Normal (speed) | Bình thường | |
| Aspect ratio | Tỷ lệ khung hình | |
| Sync | Đồng bộ hóa | Sync |
| Bandwidth | Băng thông | |
| Port | Cổng | Port |
| Host, hostname | Tên máy chủ | Host |
| Certificate | Chứng chỉ | |
| Firewall | Tường lửa | |
| Torrent | torrent | |
| Seeder / Peer | người chia sẻ / máy ngang hàng | seeder, peer |
| Seeding (a torrent) | Đang chia sẻ | Đang seed |
| The swarm | các máy ngang hàng | swarm |
| Indexer | Trình lập chỉ mục | Indexer |
| Usenet | Usenet | |
| Webhook | Webhook | |
| Two-factor authentication | Xác thực hai yếu tố | 2FA alone |
| Recovery code | Mã khôi phục | |
| One-time code | Mã dùng một lần | OTP |
| Cache | Bộ nhớ đệm | Cache |
| Snapshot | Bản chụp nhanh | Snapshot |
| Migration | Chuyển đổi dữ liệu | Migration |
| Scan (a library) | Quét | Scan |
| Metadata | Siêu dữ liệu | Metadata |
| Match (a title) | Nhận diện | Khớp, Match |
| Fix the match (by hand) | Sửa nhận diện; *Nhận diện lại* for an automatic rerun | Khớp lại |
| Probing (a file) | Phân tích tệp | Thăm dò |
| Acquisition (the module) | Thu thập nội dung | Mua lại |
| Controls (of the player) | Nút điều khiển | Điều khiển alone |
| Timeline, scrub bar, seek bar | Thanh tua | Timeline |
| Progress bar | Thanh tiến trình | |
| Storyboard (seek previews) | Ảnh xem trước | Storyboard |
| Intro and credits detection | Nhận diện đoạn mở đầu và danh đề | |
| Credits | danh đề | credit |
| Kill switch | Ngắt mạng khẩn cấp | Kill switch alone |
| Uptime | Thời gian hoạt động | Uptime |
| Last year (a time range) | 12 tháng qua | Năm ngoái |
| Top users | Người dùng xem nhiều nhất | Top người dùng |
| Mb/s | Mb/s | Mbit/s |
| Skip (a step) | Bỏ qua | Skip |
| Set up, setup | Thiết lập | Cài đặt, which is *Settings* |
| Install | Cài đặt (an app, a module) | |
| Tap (on a phone) | Nhấn | Chạm, Tap |
| Press (a remote key) | Nhấn | Bấm |
| S1E3, Play S1E3 (a chip, a button) | P1:T3, Phát P1:T3 | S1E3 |
| S1 · E3 (a card note) | Phần 1 · Tập 3 | |
| Season 2 | Phần 2 | Mùa 2 |
| 3 of 10 | 3/10 in a compact count; *3 trên 10* in a sentence | 3 của 10 |
| Step 2 of 4 | Bước 2/4 | Bước 2 của 4 |
| 1-50 of 200 (a page) | 1–50 trong tổng số 200 | 1-50 của 200 |
| Text subtitles | phụ đề dạng văn bản | phụ đề văn bản |
| Image subtitles | phụ đề dạng hình ảnh | |
| Remuxed, repackaged | đóng gói lại tức thì | remux |
| Ready to watch (a notification) | Đã có thể xem | Sẵn sàng để xem |
| Continue Watching (the row) | Xem tiếp | |
| Critically acclaimed | Được giới phê bình khen ngợi | Được hoan nghênh |
| Trending | Thịnh hành | Xu hướng |
| Featured | Nổi bật | |
| Recently added | Mới thêm | Được thêm gần đây |
| A-Z (a sort) | Từ A đến Z | A-Z |
| AI suggestions | Gợi ý từ AI | Đề xuất AI |
| Recommendations | Đề xuất | Khuyến nghị |
| Invite a user | Mời người dùng | |
| e.g. | ví dụ | VD, v.d. |
| Blocklist | Danh sách chặn | Danh sách đen |
| Port forwarding | Chuyển tiếp cổng | Mở port |
| Supervise (a process) | Giám sát | |
| Required (a form field) | Bắt buộc nhập | Là bắt buộc |
| Use at least 8 characters | Nhập tối thiểu 8 ký tự | Sử dụng ít nhất 8 ký tự |
| 8+ characters | tối thiểu 8 ký tự | 8+ ký tự |
| Rights, permissions | Quyền | Quyền hạn |
| You are signed out (a state) | Đã đăng xuất | Bạn đã bị đăng xuất |
| Media items (a count) | phim | mục media |
| Feature | Tính năng | Feature |
| LAN address | địa chỉ mạng nội bộ | địa chỉ LAN |
| Roku (the device) | thiết bị Roku | |
| At any time | bất cứ lúc nào | |
| Sign in failed | Không thể đăng nhập | Đăng nhập thất bại |
| Invalid credentials | Tên đăng nhập hoặc mật khẩu không đúng | Thông tin xác thực không hợp lệ |
| Has already been used (a link, a code) | đã được dùng | đã được sử dụng rồi |
| Expired | đã hết hạn | |
| Invalid (a link, a code) | không hợp lệ | |
| Wrong (a code, a PIN) | không đúng | sai (too blunt in a sentence, fine on a short label) |
| Who's watching? | Ai đang xem? | |
| Switch profile | Đổi hồ sơ | Chuyển đổi hồ sơ |
| Profile lock | Khóa hồ sơ | |
| Avatar | Ảnh đại diện | Avatar |
| Profile photo | Ảnh hồ sơ | |
| Notifications | Thông báo | |
| Security | Bảo mật | |
| Interface language | Ngôn ngữ giao diện | |
| Keyboard layout | Bố cục bàn phím | Kiểu bàn phím |
| Real-time activity | Hoạt động trực tiếp | Hoạt động thời gian thực |
| Statistics | Thống kê | |
| Biography | Tiểu sử | |
| Born / Died | Ngày sinh / Ngày mất | Sinh / Chết |
| Birthplace | Nơi sinh | |
| Similar titles | Phim tương tự | Tiêu đề tương tự |
| Required (the form error) | Cần điền mục này. | Mục này là bắt buộc. |
| Media details (the file's codecs) | Chi tiết tệp | Chi tiết media |
| Container (MKV, MP4) | Định dạng chứa | Container |
| Size (of a file) | Dung lượng | Kích cỡ |
| Size (of subtitle text) | Cỡ chữ | |
| Studios | Hãng phim | Studio |
| Opacity | Độ mờ đục | Opacity, Độ trong suốt (the opposite) |
| Edge (subtitle text) | Kiểu viền: Không có, Viền đều, Bóng đổ, Nổi, Chìm | |
| Sans-serif / Serif / Monospace | Không chân / Có chân / đơn cách | Sans, Mono |
| Casual / Cursive / Small capitals (fonts) | Chữ viết tay / Chữ thảo / Chữ hoa nhỏ | |
| Transcribe (speech to text) | Chép lời | Phiên âm |
| Boost (the audio filter) / Volume boost | Tăng âm / Tăng âm lượng | Boost |
| Night mode | Chế độ ban đêm | |
| People (search results) | Diễn viên và đoàn phim | Mọi người, Người |
| Downloads (the screen) | Nội dung tải xuống | Tải xuống alone as a title |
| Quick access (the command menu) | Truy cập nhanh | |
| More (a menu group, a tab) | Khác | Thêm, which is *Add* |
| Your space (a menu group) | Của bạn | Không gian của bạn |
| Trailer (the button) | Xem trailer | Trailer alone |
| Beta (a language's stage) | thử nghiệm | beta |
| Commit (a build's git commit) | Mã commit | Commit alone |
| Built (a build date) | Ngày dựng | |
| 7+ (a maturity level) | Từ 7 tuổi | 7+ |
| Number 3 (a top-10 rank) | Hạng 3 | Số 3 |
| Speak now (voice search) | Hãy nói… | Nói bây giờ |
| Space (the keyboard key) | Dấu cách | Space, Phím cách |
| Header in capitals (EPISODES) | CÁC TẬP, written in capitals with its tone marks | |
| Summary in settings ({value} audio) | Âm thanh: {value} | {value} âm thanh |
| Quiet dialogue (audio) | Thoại nhỏ | Hội thoại yên tĩnh |
| High dynamics (audio) | Dải động rộng | Động lực cao |

The administration screens add these:

| English | Write | Not |
|---|---|---|
| About (the screen) | Giới thiệu | Về |
| Privacy | Quyền riêng tư | Riêng tư |
| Language name | Tiếng X: *Tiếng Ý*, *Tiếng Hàn*, *Tiếng Trung*, *Tiếng Pháp (Canada)* | X alone |
| Pipeline (background processing) | quy trình xử lý; *xử lý nền* for the work itself | pipeline |
| Stage (of the pipeline) | bước | giai đoạn |
| Element (one movie or episode in a list) | mục | phần tử |
| Markers (intro and credits of episodes) | Mở đầu và danh đề | Mốc |
| Credits (a movie's end) | Danh đề | Credits |
| Embedding | vector nhúng | embedding |
| Enrichment (from TMDB) | bổ sung thông tin | làm giàu |
| Incremental (a job) | chạy tăng dần | gia tăng |
| Fingerprint (audio) | dấu vân tay | |
| Cron expression | biểu thức cron | |
| WAL | nhật ký ghi trước (WAL) | WAL alone |
| Quality profile | cấu hình chất lượng | hồ sơ chất lượng |
| Acquisition (the module, the admin group) | Thu thập nội dung | Thu nhận |
| Grab (a release) | tải về; *Đang tải về* for the state | Grab, lấy |
| Interactive search | Tìm thủ công | Tìm kiếm tương tác |
| Free search | Tìm tự do | |
| Tracker | tracker | |
| Monitor, follow (a title) | Theo dõi; *Ngừng theo dõi* | Giám sát |
| Specials (season 0) | Tập đặc biệt | Specials |
| Pilot | tập đầu tiên (pilot) | |
| Ledger (a show's seasons and episodes) | danh sách tập | sổ cái |
| Preset (network rules, monitoring) | mẫu | cài đặt sẵn |
| Undo | Hoàn tác | Hủy bỏ |
| Recycle bin | Thùng rác | |
| Digest | bản tin | tóm tắt |
| Push (a notification) | thông báo đẩy | push |
| Inbox (notifications) | hộp thư | |
| Archive (a notification) | Lưu trữ | |
| Problem report | báo cáo sự cố | |
| Resolve / Dismiss (a report) | Đánh dấu đã xử lý / Bỏ qua | Giải quyết / Hủy |
| Approve / Deny (a request) | Duyệt / Từ chối | Chấp thuận |
| Relay (kroma.tv) | dịch vụ chuyển tiếp kroma.tv | relay |
| Host updater | công cụ cập nhật trên máy chủ | |
| Registry (modules) | kho mô-đun; *kho chính thức* for the official one | registry |
| Publisher (of a module) | bên phát hành | nhà xuất bản |
| Isolation (a module's sandbox) | vùng cách ly | sandbox |
| Middleware (network) | Mô-đun trung gian | Middleware |
| Rule (network) | quy tắc | luật |
| Route: direct / VPN / blocked | Trực tiếp / VPN / Bị chặn | |
| Allowed / Blocked | Được phép / Bị chặn | |
| Tunnel | đường hầm | tunnel |
| Listening (a socket) | Đang lắng nghe | |
| Caller (who opened a connection) | Nguồn | Người gọi |
| Volume (of traffic) | Lưu lượng | Âm lượng, which is sound |
| Router (VPN, network) | bộ định tuyến | router |
| Sign-in provider (in an error, as {provider}'s fallback) | dịch vụ đăng nhập | nhà cung cấp danh tính |
| Issuer, client ID, client secret, redirect URI, ID token | kept in English | |
| Provider (AI, VPN) | Nhà cung cấp | |
| Kids profile | hồ sơ Trẻ em | hồ sơ Trẻ con |
| Maturity limit (a profile) | Giới hạn độ tuổi | |
| Free space / Volumes (disks) | Còn trống / Ổ đĩa | |
| Stats for nerds | Thông số chi tiết | Thống kê cho dân kỹ thuật |
| Setup (the first-run flow) | Thiết lập | Cài đặt |
| Admin (the section, in a path or a sentence) | Máy chủ, the sidebar's own label: *Máy chủ → Mô-đun* | Quản trị |
| ADMIN (a badge) | QUẢN TRỊ | |
| Self-hosted | bạn tự vận hành; *Tự vận hành* as a label | tự lưu trữ, which reads as self-storage |
| Profile (quality, in acquisition) | cấu hình | hồ sơ, which is a viewer's profile |
| Cutoff / Upgrade until (a score) | Mục tiêu / Nâng cấp đến | Ngưỡng cắt |
| Custom format / Format score | định dạng (tùy chỉnh) / điểm định dạng | |
| Quality ladder / one rung | Thang chất lượng / bậc | |
| Edition / Revision (a release) | Ấn bản / Bản sửa | Phiên bản, which is a version |
| Season pack | Trọn phần | Gói mùa |
| Download client / its engine | trình tải xuống / trình tải | máy khách tải |
| Leecher / Ratio | người đang tải / Tỷ lệ chia sẻ | leecher |
| Exit IP (VPN) | IP đầu ra | IP thoát |
| Bridge (WireGuard to SOCKS5) | cầu nối | bridge |
| Extension point / answers a point | điểm mở rộng / cung cấp | trả lời |
| Called by (a point) | Mô-đun gọi đến | |
| Inert (a module nothing serves) | Chưa dùng được | Trơ |
| Store (modules) | Cửa hàng mô-đun | Store |
| Forget (a saved sign-in) | Quên, as iOS says *Quên mạng này* | |
| Parent folder | Thư mục mẹ | Thư mục cha |
| Remux (a label) | Đóng gói lại | Remux |
| Tokens (in a file name template) | Biến | Token |
| Case (upper, lower) | Kiểu chữ | |
| Approve (a join request, a request) | Duyệt | Phê duyệt |
| Reset access (an account) | Đặt lại mật khẩu: the link ends in a new password | Đặt lại quyền truy cập |
| Discard (unsaved changes) | Bỏ thay đổi | Bỏ alone |

A toast about a title is one whole message with {title} in it, and the title
takes “ ”. Lead with what was done, *Đã* + verb, and name the thing acted on
when it is not the title itself: *Đã duyệt yêu cầu “{title}”*, *Đã xóa báo cáo
về “{title}”*, *Đã ngừng theo dõi “{title}”*. A state still holding takes
*Đang*: *Đang theo dõi “{title}”*. No full stop. A status before a list is a
label and a colon: *Lỗi: {names}*, *Đang chạy: {names}*.

Some keys are still fragments the code glues to a number or a list. Read the
component before writing one:

- After a number: the bare noun, lowercase, *phần*, *tập*, *mục được theo dõi*.
- A list the code joins with ` · `: lowercase items, *bộ sưu tập*,
  *danh sách phát*.
- A phrase that fills {provider} in someone else's sentence: no possessive,
  since the sentence may already carry *của bạn*.

A genre name is TMDB's Vietnamese name. TMDB writes every film genre with
*Phim* in front and in Title Case (*Phim Hành Động*). KROMA matches a stored
genre against the label folded (no case, no tone marks), so write it in
sentence case, *Phim hành động*, and keep TMDB's words. Where TMDB keeps an
English name for a television genre (*Action & Adventure*, *Kids*, *News*,
*Reality*, *Sci-Fi & Fantasy*, *Soap*, *Talk*, *War & Politics*), the English
label already matches, so write a Vietnamese label of your own:

| Slug | Vietnamese | TMDB's own |
|---|---|---|
| action | Phim hành động | Phim Hành Động |
| adventure | Phim phiêu lưu | Phim Phiêu Lưu |
| animation | Phim hoạt hình | Phim Hoạt Hình |
| comedy | Phim hài | Phim Hài |
| crime | Phim hình sự | Phim Hình Sự |
| documentary | Phim tài liệu | Phim Tài Liệu |
| drama | Phim chính kịch | Phim Chính Kịch |
| family | Phim gia đình | Phim Gia Đình |
| fantasy | Phim giả tưởng | Phim Giả Tượng (TMDB's typo folds the same) |
| history | Phim lịch sử | Phim Lịch Sử |
| horror | Phim kinh dị | Phim Kinh Dị |
| music | Phim nhạc | Phim Nhạc |
| mystery | Phim bí ẩn | Phim Bí Ẩn |
| romance | Phim lãng mạn | Phim Lãng Mạn |
| science-fiction | Phim khoa học viễn tưởng | Phim Khoa Học Viễn Tưởng |
| thriller | Phim gây cấn | Phim Gây Cấn |
| tv-movie | Chương trình truyền hình | Chương Trình Truyền Hình (sic) |
| war | Phim chiến tranh | Phim Chiến Tranh |
| western | Phim miền Tây | Phim Miền Tây |
| action-adventure | Hành động và phiêu lưu | Action & Adventure |
| kids | Thiếu nhi | Kids |
| news | Tin tức | News |
| reality | Truyền hình thực tế | Reality |
| sci-fi-fantasy | Viễn tưởng và giả tưởng | Sci-Fi & Fantasy |
| soap | Phim dài tập | Soap |
| talk | Talkshow | Talk |
| war-politics | Chiến tranh và chính trị | War & Politics |

## The `vocab.*` words

These are not shown: the server reads them, in every language at once, to
understand a search ("season 2") and to find a theme in a synopsis. The search
folds each word to ASCII and keeps only the ones that are a single token.

- Vietnamese words for *movie* and *series* are two syllables (*phim lẻ*, *phim
  bộ*), so the search does not use them. Never write bare *phim* under
  `vocab.movie`: *phim bộ* would then read as a request for movies.
- `vocab.numbers` stays out. Folded, *bảy*, *bốn*, *năm*, *tám*, *chín* become
  *bay*, *bon*, *nam*, *tam*, *chin*, which are names in titles of every
  language (Michael Bay, Nam Joo-hyuk), and each would also match the digit.
- Theme words are phrases where a single syllable is ambiguous: *mùa hè*, not
  *hè*, which folds to the English *he*.

## Calques to avoid

| Written | Why it is wrong | Write |
|---|---|---|
| Nhập mật khẩu của bạn | a possessive because English has one | Nhập mật khẩu |
| Bạn đã bị đăng xuất | the passive *bị* blames the reader | Đã đăng xuất |
| Thư viện của bạn đang đến | *is arriving* word for word | Thư viện đang được bổ sung; *Thư viện đang được tạo* on a first scan |
| Được đạo diễn bởi {name} | English passive with *bởi* | Đạo diễn: {name} |
| Tệp đã được lưu thành công | *successfully* is noise, and the passive | Đã lưu tệp |
| Đã xảy ra lỗi: không tìm thấy tệp | a colon where Vietnamese states the fact | Không tìm thấy tệp |
| Đăng nhập thất bại | a status where the reader wants a sentence | Không thể đăng nhập |
| Vui lòng thử lại | stacked politeness | Thử lại sau, Hãy thử lại sau ít phút |
| Thiết bị này không biết đọc định dạng này | the device does a human thing | Thiết bị này không phát được định dạng này |
| Máy chủ từ chối (as the whole hint) | the server as a person | Máy chủ không cho phép phát nội dung này |
| Tận hưởng nhiều hơn từ thư viện | *get more from* word for word | Dùng thư viện hiệu quả hơn |
| Tất cả mọi thứ ở một nơi | *everything in one place* | Phim lẻ và phim bộ ở cùng một chỗ |
| Hãy bắt đầu ngay! | an exclamation mark on a call to action | Bắt đầu ngay |
| Mùa 2 | *season* word for word, where Netflix says *Phần* | Phần 2 |
| {count} tập phim(s) | an English plural | {count} tập |
| những người dùng | a plural marker where Vietnamese leaves the noun bare | người dùng |
| có thể được dùng để | *can be used to*, the passive | dùng để |
| Thực hiện một tìm kiếm | *perform a search*, a noun where a verb works | Tìm kiếm |
| Trên cùng một mạng với máy chủ của bạn | three possessives and *with* | Cùng mạng với máy chủ |

## Plurals

`todo` lists **other** alone for Vietnamese: CLDR gives the language one
category. Write the bare key only. A noun after a number never changes: *1 tập*,
*12 tập*. `_zero` only where the source has one and a zero sentence reads
better: *Chưa có kết quả nào*.

Where English switches between singular and plural in a label (*Studio* /
*Studios*), write the one Vietnamese label that covers both.

The bare form is read for every count, 1 included, so it cannot say what only
holds for several: *{count} configs ready, one per server* is
*{count} cấu hình đã sẵn sàng*. A source with `_one` and `_other` and no bare
key still takes the bare key. *Chọn tất cả ({amount} phim)*, not
*Chọn cả {amount} phim*.

## Turns that make Vietnamese sound Vietnamese

- *Chưa … nào* for an empty state: *Chưa có yêu cầu nào.*
- *… rồi …* to chain two steps: *Sao chép lại tệp rồi quét thư viện.*
- *Không cần* + verb for *you do not need to*: *Không cần quét, không cần nhập.*
- *Mỗi* for *each*: *Mỗi thư mục là một thư viện.*
- *bất cứ lúc nào* for *at any time*.
- *Đang* for a state in progress, *Đã* for one done, *Chưa* for one not yet.
- A topic first, then the comment, where English puts a long subject: *Phụ đề
  này, KROMA không đọc được.* is too far; *KROMA không đọc được phụ đề này.* is
  right. Keep the topic turn for a short label.
