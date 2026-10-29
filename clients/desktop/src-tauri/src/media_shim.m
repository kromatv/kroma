// The macOS media integration for the libmpv engine: the keyboard's media keys
// and the system's Now Playing widget, both through MediaPlayer. MRC.
#import <Cocoa/Cocoa.h>
#import <MediaPlayer/MediaPlayer.h>

// Rust callbacks (libmpv_mac.rs): a MacBook media key was pressed / the OS scrubber moved.
extern void kroma_media_key_pressed(const char* action);
extern void kroma_media_seek(double position);
extern void kroma_pip_set_state(double duration, double position, int playing);

// Register for the MacBook's hardware media keys via MPRemoteCommandCenter, and set
// minimal Now Playing info so macOS routes those keys to us (the mpv video plane has no
// media element, so the browser Media Session can't). Each command forwards to Rust,
// which re-emits it to the frontend player. MUST run on the main thread.
// Enable a remote command and forward each press to Rust as the given action string (a
// static literal, safe to capture in the handler block).
static void kroma_bind_command(MPRemoteCommand* cmd, const char* action) {
    cmd.enabled = YES;
    [cmd addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent* e) {
        (void)e;
        kroma_media_key_pressed(action);
        return MPRemoteCommandHandlerStatusSuccess;
    }];
}

static void kroma_bind_seek(MPRemoteCommand* cmd, const char* begin, const char* end) {
    cmd.enabled = YES;
    [cmd addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent* e) {
        MPSeekCommandEvent* seek = (MPSeekCommandEvent*)e;
        kroma_media_key_pressed(seek.type == MPSeekCommandEventTypeBeginSeeking ? begin : end);
        return MPRemoteCommandHandlerStatusSuccess;
    }];
}

// The keyboard's own rewind and fast-forward keys, while this app is in front.
// Now Playing reports a held key as one tap; the raw system event carries the
// key going down and coming up, which is what lets a hold become a fast seek.
enum {
    KROMA_KEY_NEXT = 17,
    KROMA_KEY_PREVIOUS = 18,
    KROMA_KEY_FAST = 19,
    KROMA_KEY_REWIND = 20,
    KROMA_MEDIA_KEY_SUBTYPE = 8,
};

static NSEvent* kroma_media_key_event(NSEvent* event) {
    if ([event subtype] != KROMA_MEDIA_KEY_SUBTYPE) return event;
    NSInteger data = [event data1];
    int code = (int)((data & 0xFFFF0000) >> 16);
    int state = (int)((data & 0xFF00) >> 8);
    BOOL repeat = (data & 0x1) != 0;
    BOOL forward = code == KROMA_KEY_FAST || code == KROMA_KEY_NEXT;
    BOOL back = code == KROMA_KEY_REWIND || code == KROMA_KEY_PREVIOUS;
    if (!forward && !back) return event;
    if (state == 0xA && !repeat) {
        kroma_media_key_pressed(forward ? "hold:forward:begin" : "hold:back:begin");
    } else if (state == 0xB) {
        kroma_media_key_pressed(forward ? "hold:forward:end" : "hold:back:end");
    }
    return nil;
}

void kroma_setup_media_keys(void) {
    [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskSystemDefined
                                          handler:^NSEvent*(NSEvent* event) {
                                              return kroma_media_key_event(event);
                                          }];
    MPRemoteCommandCenter* cc = [MPRemoteCommandCenter sharedCommandCenter];
    kroma_bind_command(cc.togglePlayPauseCommand, "playpause");
    kroma_bind_command(cc.playCommand, "play");
    kroma_bind_command(cc.pauseCommand, "pause");
    kroma_bind_command(cc.nextTrackCommand, "next");
    kroma_bind_command(cc.previousTrackCommand, "prev");
    kroma_bind_seek(cc.seekForwardCommand, "hold:forward:begin", "hold:forward:end");
    kroma_bind_seek(cc.seekBackwardCommand, "hold:back:begin", "hold:back:end");
    // Dragging the scrubber in Control Center → seek to an absolute position.
    cc.changePlaybackPositionCommand.enabled = YES;
    [cc.changePlaybackPositionCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent* e) {
        MPChangePlaybackPositionCommandEvent* pe = (MPChangePlaybackPositionCommandEvent*)e;
        kroma_media_seek(pe.positionTime);
        return MPRemoteCommandHandlerStatusSuccess;
    }];

    // No placeholder nowPlayingInfo here on purpose: the real title / poster / playback
    // state is established by kroma_set_now_playing on the first play, so Control Center
    // never advertises a fake "KROMA playing" while nothing is playing. The command targets
    // above stay registered and become live once nowPlayingInfo is set.
}

// Update the OS Now Playing widget (Control Center / lock screen) with the current
// item's title, subtitle, poster + progress. `artwork`/`artwork_len` may be empty to
// keep the current poster (so play/pause updates don't re-send the image). Main thread.
void kroma_set_now_playing(const char* title, const char* artist, double duration,
                          double position, double rate, const unsigned char* artwork,
                          size_t artwork_len) {
    MPNowPlayingInfoCenter* np = [MPNowPlayingInfoCenter defaultCenter];
    NSMutableDictionary* info =
        np.nowPlayingInfo ? [np.nowPlayingInfo mutableCopy] : [NSMutableDictionary dictionary];

    if (title) info[MPMediaItemPropertyTitle] = [NSString stringWithUTF8String:title];
    if (artist && strlen(artist) > 0)
        info[MPMediaItemPropertyArtist] = [NSString stringWithUTF8String:artist];
    if (duration > 0) info[MPMediaItemPropertyPlaybackDuration] = @(duration);
    info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = @(position);
    info[MPNowPlayingInfoPropertyPlaybackRate] = @(rate);

    if (artwork != NULL && artwork_len > 0) {
        NSData* data = [NSData dataWithBytes:artwork length:artwork_len];
        NSImage* img = [[NSImage alloc] initWithData:data];
        if (img) {
            MPMediaItemArtwork* art =
                [[MPMediaItemArtwork alloc] initWithBoundsSize:img.size
                                                requestHandler:^NSImage*(CGSize s) {
                                                  (void)s;
                                                  return img;
                                                }];
            info[MPMediaItemPropertyArtwork] = art;
            [art release]; // the dict retains it; balance alloc's +1 (no ARC in this file)
        }
        [img release]; // nil-safe; when non-nil the artwork block holds its own retain
    }

    np.nowPlayingInfo = info;
    kroma_pip_set_state(duration, position, rate > 0);
    np.playbackState = rate > 0 ? MPNowPlayingPlaybackStatePlaying : MPNowPlayingPlaybackStatePaused;
}
