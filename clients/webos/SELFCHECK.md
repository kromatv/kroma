# LG self-checklist: pre-filled answers

LG's self-checklist is **mandatory** and is **reset on every version bump**, so
this sheet is written to be refilled quickly rather than re-derived. Every item
must end as `Pass` or `N/A`, and (this is the part that catches people)
**marking something `Pass` that should be `N/A`, or the reverse, is itself a
rejection reason**. So each row below carries its evidence.

Source: the public [self-checklist
v5.0](https://seller.lgappstv.com/seller/support/RetrieveSelfCheckSample.lge),
53 test cases. Numbering matches LG's form 1:1.

## Legend

| | Meaning |
| --- | --- |
| **N/A** | The feature genuinely does not exist in this app. The reason given is the one to type into the form. |
| **Pass** | Answerable now: the behaviour is in the code and was exercised in the webOS simulator or a browser at 1920×1080. |
| **📺** | **Answer only after running it on a real LG set.** Not a verdict, a to-do. Most of these will become `Pass`. |

## The sheet

| TC | Item | Verdict | Evidence / note |
| --- | --- | --- | --- |
| 1 | Execution: launch | 📺 | Boots to the profile picker; verified in the webOS 26 simulator. Confirm cold launch on a set. |
| 2 | Main page: overscan, layout | 📺 | Fixed 1920×1080 stage (`viewport` meta), content inset from the edges. Confirm against the panel's overscan. |
| 3 | Reboot (AC **and** DC) | 📺 | Explicitly flagged in [STORE.md](./STORE.md): power-cycle mid-playback by remote *and* by unplugging. |
| 4 | Advertisement | **N/A** | The app shows no advertising of any kind. |
| 5 | Resolution / ratio | 📺 | One 1920×1080 16:9 stage; no resolution switching in-app. |
| 6 | Correct text | 📺 | EN + FR catalogues; no truncation seen at 1920×1080. Check both languages on the panel. |
| 7 | Focus / mouse-over | 📺 | `Focusable` renders distinct idle / focused / pressed states and a visible ring. Confirm with the Magic Remote pointer. |
| 8 | Flickering | 📺 | |
| 9 | Video full size | 📺 | The player video is full-bleed with no chrome margins. |
| 10 | UI buttons | 📺 | |
| 11 | BACK UI button | 📺 | On-screen back affordance plus remote Back at every depth; the router pops to the root and no further. |
| 12 | EXIT UI button | **N/A** | The app deliberately offers no EXIT control on a TV: `canQuitApp()` is false off the desktop shell, because webOS terminates the app through its own system UI (`app/appQuit.ts`). |
| 13 | Lock-up / latch-up | 📺 | |
| 14 | Abnormal termination | 📺 | |
| 15 | Keyboard: text/num entry | 📺 | The app draws its own on-screen keyboard for the server address; the LG IME applies where a real input is focused. |
| 16 | Keyboard: character fidelity | 📺 | |
| 17 | Keyboard: TV IME functions (incl. Voice Search) | 📺 | Flagged in STORE.md. |
| 18 | Terms | **N/A** | The app presents no terms or EULA. |
| 19 | Sign up | **N/A** | No membership is created in the app. Profiles exist on the viewer's own server; the app only pairs an existing one. |
| 20 | Sign in | Pass | Profile pairing (Quick Connect) plus optional per-profile PIN. Sessions persist across launches, i.e. the "stay signed-in" case. |
| 21 | Sign out | Pass | Profile menu → Sign out (`TvProfileMenu.tsx`), which clears the session for that profile. |
| 22 | Search | 📺 | Search screen present; confirm with the TV IME and a language change. |
| 23 | Adult authentication | **N/A** | The app carries no adult content. (The PIN is a per-profile lock, not age verification.) |
| 24 | Payment | **N/A** | No in-app purchase. |
| 25 | Payment: purchased list | **N/A** | No in-app purchase. |
| 26 | General remote | 📺 | |
| 27 | Magic Remote | 📺 | **Mandatory**, flagged in STORE.md. The pointer emits mouse events, which the `Focusable` hover path already handles, but verify OK-on-hover activates. |
| 28 | MMRC pointer | 📺 | |
| 29 | MMRC OK key | 📺 | |
| 30 | MMRC wheel | 📺 | Wheel scrolling of rows exists (`use-wheel-rows.ts`); confirm the Magic Remote wheel drives it. |
| 31 | Navigation keys | Pass | Arrow keys drive spatial focus; verified in the simulator. Re-confirm on the set. |
| 32 | Function (colour) keys | Pass | The colour keys are *mapped* in `@kroma/core`'s remote table but bound to no action, so they are inert, which is the required behaviour: the app must not misbehave, not must it use them. |
| 33 | OK key | Pass | Verified in the simulator. |
| 34 | MMRC-only: basic keys | **N/A** | Condition is "Magic remote control only". KROMA fully supports the general remote, so the rule does not apply. |
| 35 | MMRC-only: non-basic keys | **N/A** | Same as TC 34. |
| 36 | HOME key | 📺 | Platform-handled. |
| 37 | BACK key | Pass | `disableBackHistoryAPI: true` routes Back to the app, where keyCode 461 maps to Back (`packages/core/src/remote.ts`). Confirm at every depth on a set. |
| 38 | EXIT key | 📺 | Platform-handled; confirm the app terminates to Live TV. |
| 39 | LIVE key | **N/A** | Condition is NetCast 4.5 / webOS 1.0 remotes. The supported floor is webOS 4.0. |
| 40 | Other / number keys | Pass | Unmapped keys are ignored rather than mishandled. |
| 41 | Change language | Pass | Device settings → Language (EN / FR); verified in the built app, and `<html lang>` now follows the choice. |
| 42 | Sound | 📺 | |
| 43 | Adaptive bitrate @ 512 Kbps / 1 / 7 / 17.5 Mbps + IPv6 | 📺 | **The hard one.** Flagged in STORE.md: direct play from the viewer's own server has no ABR ladder to climb. Decide what the demo server does under throttling *before* the test. |
| 44 | Full / Original screen | **N/A** | The player offers no aspect toggle; video fills the screen (see TC 9). |
| 45 | Playback control | 📺 | The app draws its own transport controls. |
| 46 | Replay after completion | 📺 | |
| 47 | Real-time streaming | **N/A** | No live or linear streaming. The app plays files served by the viewer's own server. |
| 48 | Subtitles | Pass | The app parses and renders WebVTT itself (`@kroma/core` + `useSubtitleSelection`) rather than relying on `<track>`. Confirm on the set. |
| 49 | Resume playback | Pass | Continue-watching resumes at the stored position. Confirm on the set. |
| 50 | Content resolutions (SD/HD/FHD/UHD) | 📺 | Whatever your demo server carries: cover each tier you declare. |
| 51 | Content codecs | 📺 | Must match the Player Specification you declare: HEVC/H.265 (incl. 10-bit/HDR) and H.264, direct play. |
| 52 | DRM | **N/A** | The app implements no DRM. |
| 53 | Factory reset, then install and run | 📺 | Flagged in STORE.md. |

## Where that leaves you

- **13 items are N/A** and can be filled in immediately, with the reasons above.
- **10 items are answerable now** as `Pass` from code and simulator evidence.
- **30 items need one session with a real LG set.** Budget for it as a single
  sitting: TC 43 (adaptive bitrate) and TC 3 / 53 (reboot, factory reset) are the
  slow ones, and TC 27–30 (Magic Remote) is the one most likely to surface a
  genuine bug, because the pointer path gets far less use than the D-pad.

At submission you may opt in to **release with known minor defects**, accepting
liability, the practical escape hatch if one of the 📺 rows comes back imperfect.
