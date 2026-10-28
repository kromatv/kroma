// Picture-in-picture for the macOS libmpv engine. The picture is mpv's GL view,
// not a media element, so neither AVKit nor WebKit can float it; AppKit's own
// PiP window (the private PIP.framework, the one Safari and IINA use) takes any
// NSViewController, so the GL view moves into it and back. Loaded at run time:
// a macOS without the framework simply reports no picture-in-picture. MRC.
#import <Cocoa/Cocoa.h>
#include <dlfcn.h>

extern void kroma_media_key_pressed(const char* action);
extern void kroma_pip_changed(int active, int playing);
extern NSView* kroma_mpv_view(void);

@protocol KromaPipDelegate <NSObject>
@optional
- (BOOL)pipShouldClose:(id)sender;
- (void)pipWillClose:(id)sender;
- (void)pipDidClose:(id)sender;
- (void)pipActionPlay:(id)sender;
- (void)pipActionPause:(id)sender;
- (void)pipActionStop:(id)sender;
- (void)pipAction:(id)sender skipInterval:(double)interval;
@end

@interface NSObject (KromaPipState)
- (void)setContentDuration:(double)duration;
- (void)setPlaybackRate:(double)rate elapsedTime:(double)elapsed timeControlStatus:(long)status;
@end

@interface NSViewController (KromaPip)
@property (nonatomic, assign) id delegate;
@property (nonatomic) NSSize aspectRatio;
@property (nonatomic) BOOL playing;
@property (nonatomic) BOOL userCanResize;
@property (nonatomic, assign) NSWindow* replacementWindow;
@property (nonatomic) NSRect replacementRect;
- (void)presentViewControllerAsPictureInPicture:(NSViewController*)vc;
- (void)updatePlaybackStateUsingBlock:(void (^)(id state))block;
@end

@interface KromaPip : NSObject <KromaPipDelegate> {
@public
    NSViewController* pip;
    NSViewController* holder;
    NSView* home;
    NSView* view;
    BOOL playing;
    double duration;
    double position;
    BOOL stopped;
}
@end

static KromaPip* g_pip = nil;

static void kroma_pip_restore(KromaPip* p) {
    NSView* view = p->view;
    NSView* home = p->home;
    p->view = nil;
    if (view == nil) return;
    if (home == nil) {
        [view release];
        return;
    }
    [view removeFromSuperview];
    [view setFrame:[home bounds]];
    NSArray* subs = [home subviews];
    if ([subs count] > 0) {
        [home addSubview:view positioned:NSWindowBelow relativeTo:[subs objectAtIndex:0]];
    } else {
        [home addSubview:view];
    }
    [view release];
}

@implementation KromaPip

- (BOOL)pipShouldClose:(id)sender {
    (void)sender;
    return YES;
}

- (void)pipWillClose:(id)sender {
    NSWindow* window = [home window];
    [sender setReplacementWindow:window];
    [sender setReplacementRect:[home frame]];
}

- (void)pipDidClose:(id)sender {
    (void)sender;
    kroma_pip_restore(self);
    [holder release];
    holder = nil;
    kroma_pip_changed(0, stopped ? 0 : playing);
    stopped = NO;
}

- (void)pipActionPlay:(id)sender {
    (void)sender;
    kroma_media_key_pressed("play");
}

- (void)pipActionPause:(id)sender {
    (void)sender;
    kroma_media_key_pressed("pause");
}

- (void)pipAction:(id)sender skipInterval:(double)interval {
    (void)sender;
    char action[32];
    snprintf(action, sizeof action, "skip:%g", interval);
    kroma_media_key_pressed(action);
}

- (void)pipActionStop:(id)sender {
    (void)sender;
    stopped = YES;
    kroma_media_key_pressed("pause");
}

@end

static void kroma_pip_push_state(KromaPip* p) {
    if (p->pip == nil || ![p->pip respondsToSelector:@selector(updatePlaybackStateUsingBlock:)]) {
        [p->pip setPlaying:p->playing];
        return;
    }
    double duration = p->duration;
    double position = p->position;
    double rate = p->playing ? 1.0 : 0.0;
    long status = p->playing ? 2 : 0;
    [p->pip updatePlaybackStateUsingBlock:^(id state) {
        if (duration > 0) [state setContentDuration:duration];
        [state setPlaybackRate:rate elapsedTime:position timeControlStatus:status];
    }];
}

static Class kroma_pip_class(void) {
    static Class cls = Nil;
    static BOOL tried = NO;
    if (!tried) {
        tried = YES;
        if (dlopen("/System/Library/PrivateFrameworks/PIP.framework/PIP", RTLD_LAZY) != NULL) {
            cls = NSClassFromString(@"PIPViewController");
        }
    }
    return cls;
}

int kroma_pip_available(void) {
    return kroma_pip_class() != Nil && kroma_mpv_view() != nil;
}

// Float the mpv picture in the system's PiP window. `aspect` is width over height.
// Returns 0 on success. MUST run on the main thread.
int kroma_pip_start(double aspect) {
    Class cls = kroma_pip_class();
    NSView* view = kroma_mpv_view();
    if (cls == Nil || view == nil) return -1;
    if (g_pip != nil && g_pip->holder != nil) return 0;
    if (g_pip == nil) g_pip = [[KromaPip alloc] init];

    KromaPip* p = g_pip;
    p->home = [view superview];
    p->stopped = NO;
    if (p->pip == nil) {
        p->pip = [[cls alloc] init];
        [p->pip setDelegate:p];
        [p->pip setUserCanResize:YES];
    }
    double ratio = aspect > 0 ? aspect : 16.0 / 9.0;
    [p->pip setAspectRatio:NSMakeSize(ratio * 1000.0, 1000.0)];
    kroma_pip_push_state(p);

    NSViewController* holder = [[NSViewController alloc] init];
    NSView* box = [[NSView alloc] initWithFrame:[view frame]];
    p->view = [view retain];
    [view removeFromSuperview];
    [view setFrame:[box bounds]];
    [view setAutoresizingMask:(NSViewWidthSizable | NSViewHeightSizable)];
    [box addSubview:view];
    [holder setView:box];
    [box release];
    p->holder = holder;
    [p->pip presentViewControllerAsPictureInPicture:holder];
    kroma_pip_changed(1, p->playing);
    return 0;
}

// Close the PiP window; the picture returns to the app window. Main thread.
void kroma_pip_stop(void) {
    KromaPip* p = g_pip;
    if (p == nil || p->holder == nil) return;
    [p->pip dismissViewController:p->holder];
}

// The film's duration, position and play state, mirrored on the PiP window's
// scrubber and play/pause button.
void kroma_pip_set_state(double duration, double position, int playing) {
    if (g_pip == nil) {
        g_pip = [[KromaPip alloc] init];
    }
    if (duration > 0) g_pip->duration = duration;
    g_pip->position = position;
    g_pip->playing = playing ? YES : NO;
    if (g_pip->pip != nil) kroma_pip_push_state(g_pip);
}
