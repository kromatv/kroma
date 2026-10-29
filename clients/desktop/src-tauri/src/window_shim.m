// Obj-C shim for the macOS libmpv engine, using mpv's RENDER API (like IINA): mpv draws
// into an NSOpenGLView we own, inserted BEHIND the transparent WKWebView - one window,
// no separate mpv window, no reparenting. A CVDisplayLink drives the render; the app
// window + webview are made see-through so the React player chrome composites on top.
// MRC (no ARC): the view is retained by its superview; teardown leaks (process-lifetime).
#import <Cocoa/Cocoa.h>
#import <OpenGL/gl.h>
#import <OpenGL/OpenGL.h>
#import <CoreVideo/CoreVideo.h>
#include <mpv/render_gl.h>


// Resolve a GL function pointer from the system OpenGL framework (for mpv's renderer).
static void* kroma_gl_get_proc(void* ctx, const char* name) {
    (void)ctx;
    static CFBundleRef bundle = NULL;
    if (bundle == NULL) {
        bundle = CFBundleGetBundleWithIdentifier(CFSTR("com.apple.opengl"));
    }
    if (bundle == NULL) return NULL;
    CFStringRef s = CFStringCreateWithCString(kCFAllocatorDefault, name, kCFStringEncodingASCII);
    void* p = CFBundleGetFunctionPointerForName(bundle, s);
    CFRelease(s);
    return p;
}

@interface KromaMpvView : NSOpenGLView {
@public
    mpv_render_context* render_ctx;
    CVDisplayLinkRef link;
    BOOL needsClear; // set on a file switch so the previous frame doesn't linger
    int backingW;    // backing-pixel size, snapshotted on the MAIN thread (reshape/setup)
    int backingH;    // so the CVDisplayLink render thread never reads NSView geometry
}
- (void)renderFrame:(BOOL)force;
- (void)snapshotBacking;
@end

// The single GL view, so a file switch (mpv_load) can request a one-shot clear.
static KromaMpvView* g_mpv_view = nil;

// The GL view, for the picture-in-picture window to borrow (pip_shim.m).
NSView* kroma_mpv_view(void) {
    return g_mpv_view;
}


@implementation KromaMpvView

// Render mpv's current frame into the view's default framebuffer (fbo 0). Locked so the
// CVDisplayLink thread and the main thread (drawRect/resize) never touch GL at once.
// `force=NO` skips entirely when mpv has no new frame (the display link fires at 60fps;
// drawing every tick regardless is the main lag source with a transparent overlay).
- (void)renderFrame:(BOOL)force {
    NSOpenGLContext* glctx = [self openGLContext];
    if (glctx == nil) return;
    BOOL clear = needsClear;
    if (render_ctx != NULL && !force && !clear) {
        if (!(mpv_render_context_update(render_ctx) & MPV_RENDER_UPDATE_FRAME)) return;
    }
    CGLContextObj cgl = [glctx CGLContextObj];
    CGLLockContext(cgl);
    [glctx makeCurrentContext];
    if (clear) {
        // File switch: blank the view so the last frame of the previous video doesn't
        // show while the next one buffers. The next real frame overwrites it.
        needsClear = NO;
        glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
        glClear(GL_COLOR_BUFFER_BIT);
        [glctx flushBuffer];
        CGLUnlockContext(cgl);
        return;
    }
    if (render_ctx != NULL) {
        // Read the size snapshotted on the main thread (reshape); never touch the NSView
        // here on the display-link thread.
        mpv_opengl_fbo fbo;
        fbo.fbo = 0;
        fbo.w = backingW;
        fbo.h = backingH;
        fbo.internal_format = 0;
        int flip = 1; // OpenGL's origin is bottom-left; flip so the picture is upright
        mpv_render_param params[] = {
            {MPV_RENDER_PARAM_OPENGL_FBO, &fbo},
            {MPV_RENDER_PARAM_FLIP_Y, &flip},
            {MPV_RENDER_PARAM_INVALID, NULL},
        };
        mpv_render_context_render(render_ctx, params);
        [glctx flushBuffer];
        mpv_render_context_report_swap(render_ctx); // frame-timing feedback to mpv
    } else {
        glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
        glClear(GL_COLOR_BUFFER_BIT);
        [glctx flushBuffer];
    }
    CGLUnlockContext(cgl);
}

- (void)drawRect:(NSRect)dirtyRect {
    (void)dirtyRect;
    [self renderFrame:YES];
}

// Called on the MAIN thread whenever the view resizes; snapshot the backing-pixel size
// here so the CVDisplayLink render thread reads plain ints instead of NSView geometry.
- (void)snapshotBacking {
    NSOpenGLContext* glctx = [self openGLContext];
    CGLContextObj cgl = [glctx CGLContextObj];
    if (cgl != NULL) CGLLockContext(cgl);
    [glctx update];
    NSSize px = [self convertSizeToBacking:[self bounds].size];
    backingW = (int)px.width;
    backingH = (int)px.height;
    if (cgl != NULL) CGLUnlockContext(cgl);
}

- (void)reshape {
    [super reshape];
    [self snapshotBacking];
}

- (void)setFrameSize:(NSSize)size {
    [super setFrameSize:size];
    [self snapshotBacking];
}

- (void)viewDidMoveToWindow {
    [super viewDidMoveToWindow];
    [self snapshotBacking];
}

- (void)viewDidChangeBackingProperties {
    [super viewDidChangeBackingProperties];
    [self snapshotBacking];
}

@end

// CVDisplayLink tick -> render the next frame (runs on a background thread).
static CVReturn kroma_display_cb(CVDisplayLinkRef dl, const CVTimeStamp* now,
                                const CVTimeStamp* outT, CVOptionFlags flags,
                                CVOptionFlags* flagsOut, void* ctx) {
    (void)dl; (void)now; (void)outT; (void)flags; (void)flagsOut;
    @autoreleasepool {
        [(KromaMpvView*)ctx renderFrame:NO];
    }
    return kCVReturnSuccess;
}

// mpv signals a new frame is ready; the CVDisplayLink renders continuously, so no-op.
static void kroma_mpv_update_cb(void* ctx) {
    (void)ctx;
}

// Request a one-shot clear of the GL view (called from mpv_load on a file switch, so the
// previous video's last frame doesn't linger while the next buffers).
void kroma_mpv_request_clear(void) {
    if (g_mpv_view != nil) g_mpv_view->needsClear = YES;
}

// Create the GL view behind the app's webview + the mpv render context bound to it, and
// make the app window + webview see-through. Returns 0 on success. MUST run on the main
// thread. `mpv_handle_ptr` is the raw mpv_handle*.
int kroma_mpv_render_setup(void* parent_nswindow, void* mpv_handle_ptr) {
    NSWindow* parent = (NSWindow*)parent_nswindow;
    mpv_handle* mpv = (mpv_handle*)mpv_handle_ptr;
    if (parent == nil || mpv == NULL) return -1;

    NSOpenGLPixelFormatAttribute attrs[] = {
        NSOpenGLPFAAccelerated,
        NSOpenGLPFADoubleBuffer,
        NSOpenGLPFAColorSize, 24,
        NSOpenGLPFAAlphaSize, 8,
        NSOpenGLPFAOpenGLProfile, NSOpenGLProfileVersion3_2Core,
        0,
    };
    NSOpenGLPixelFormat* pf = [[NSOpenGLPixelFormat alloc] initWithAttributes:attrs];
    if (pf == nil) return -2;

    NSView* content = [parent contentView];
    KromaMpvView* view = [[KromaMpvView alloc] initWithFrame:[content bounds] pixelFormat:pf];
    if (view == nil) return -3;
    view->render_ctx = NULL;
    view->link = NULL;
    view->needsClear = NO;
    g_mpv_view = view;
    [view setWantsBestResolutionOpenGLSurface:YES];
    [view setAutoresizingMask:(NSViewWidthSizable | NSViewHeightSizable)];

    // Insert behind the WKWebView so the UI stays on top.
    NSArray* subs = [content subviews];
    if ([subs count] > 0) {
        [content addSubview:view positioned:NSWindowBelow relativeTo:[subs objectAtIndex:0]];
    } else {
        [content addSubview:view];
    }

    // App window + webview see-through so the GL video shows through the player screen.
    [parent setOpaque:NO];
    [parent setBackgroundColor:[NSColor clearColor]];
    for (NSView* sub in [content subviews]) {
        if ([NSStringFromClass([sub class]) rangeOfString:@"WKWebView"].location != NSNotFound) {
            @try {
                [sub setValue:[NSNumber numberWithBool:NO] forKey:@"drawsBackground"];
            } @catch (NSException* e) {
            }
        }
    }

    // Create the mpv render context (the GL context must be current).
    [[view openGLContext] makeCurrentContext];
    mpv_opengl_init_params gl_init;
    gl_init.get_proc_address = kroma_gl_get_proc;
    gl_init.get_proc_address_ctx = NULL;
    mpv_render_param params[] = {
        {MPV_RENDER_PARAM_API_TYPE, (void*)MPV_RENDER_API_TYPE_OPENGL},
        {MPV_RENDER_PARAM_OPENGL_INIT_PARAMS, &gl_init},
        {MPV_RENDER_PARAM_INVALID, NULL},
    };
    int rc = mpv_render_context_create(&view->render_ctx, mpv, params);
    if (rc < 0) {
        NSLog(@"KROMA: mpv_render_context_create failed: %d", rc);
        return -4;
    }
    mpv_render_context_set_update_callback(view->render_ctx, kroma_mpv_update_cb, (void*)view);

    // Seed the backing size on the main thread before the display link starts (reshape
    // keeps it current thereafter), so the first render already has a valid framebuffer.
    NSSize px0 = [view convertSizeToBacking:[view bounds].size];
    view->backingW = (int)px0.width;
    view->backingH = (int)px0.height;

    // Drive rendering off a display link.
    CVDisplayLinkCreateWithActiveCGDisplays(&view->link);
    CVDisplayLinkSetOutputCallback(view->link, kroma_display_cb, (void*)view);
    CVDisplayLinkStart(view->link);
    return 0;
}
