#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

#include "webauth_darwin.h"
#include "_cgo_export.h" // Go callbacks: webauthProbe, webauthClosed

// O3WebAuth owns the login window and drives capture. On a repeating timer (and
// on each finished navigation) it reads the cookie store and the current URL,
// hands them to Go via webauthProbe; when Go signals success (1) it closes the
// window. Closing the window before success reports cancellation to Go.
@interface O3WebAuth : NSObject <WKNavigationDelegate, NSWindowDelegate, WKScriptMessageHandler>
@property (nonatomic, strong) NSWindow *window;
@property (nonatomic, strong) WKWebView *webView;
@property (nonatomic, strong) NSTimer *timer;
@property (nonatomic, copy)   NSString *authorization; // JS fallback capture
@property (nonatomic, copy)   NSString *email;         // JS fallback capture
@property (nonatomic)         BOOL done;
@end

static O3WebAuth *gAuth = nil; // strong global: the one live capture

@implementation O3WebAuth

- (void)probe {
    if (self.done) return;
    WKHTTPCookieStore *store = self.webView.configuration.websiteDataStore.httpCookieStore;
    NSString *currentURL = self.webView.URL ? self.webView.URL.absoluteString : @"";
    NSString *authz = self.authorization ?: @"";
    NSString *email = self.email ?: @"";
    [store getAllCookies:^(NSArray<NSHTTPCookie *> *cookies) {
        if (self.done) return; // window was superseded/closed while fetching
        NSMutableArray *arr = [NSMutableArray array];
        for (NSHTTPCookie *c in cookies) {
            NSTimeInterval exp = c.expiresDate ? [c.expiresDate timeIntervalSince1970] : 0;
            [arr addObject:@{
                @"name": c.name ?: @"", @"value": c.value ?: @"",
                @"domain": c.domain ?: @"", @"path": c.path ?: @"",
                @"expires": @(exp), @"secure": @(c.isSecure), @"httpOnly": @(c.isHTTPOnly)
            }];
        }
        NSDictionary *payload = @{@"url": currentURL, @"authorization": authz,
                                  @"email": email, @"cookies": arr};
        NSData *data = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
        if (data == nil) return;
        NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
        if (webauthProbe((char *)[json UTF8String]) == 1) {
            [self finish];
        }
    }];
}

- (void)finish {
    if (self.done) return;
    self.done = YES;
    [self.timer invalidate];
    self.timer = nil;
    [self.window close];
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    NSLog(@"[webauth] didFinishNavigation url=%@", webView.URL.absoluteString);
    [self probe];
}

- (void)userContentController:(WKUserContentController *)ucc
      didReceiveScriptMessage:(WKScriptMessage *)message {
    if (![message.body isKindOfClass:[NSDictionary class]]) return;
    NSDictionary *body = (NSDictionary *)message.body;
    NSString *a = body[@"authorization"];
    if ([a isKindOfClass:[NSString class]] && a.length) self.authorization = a;
    NSString *e = body[@"email"];
    if ([e isKindOfClass:[NSString class]] && e.length) self.email = e;
}

- (void)windowWillClose:(NSNotification *)note {
    BOOL wasDone = self.done;
    self.done = YES;
    [self.timer invalidate];
    self.timer = nil;
    [self.webView.configuration.userContentController removeScriptMessageHandlerForName:@"o3"];
    NSLog(@"[webauth] windowWillClose wasDone=%d", wasDone);
    // Only a user-initiated close (not a programmatic supersede/finish) reports
    // cancellation to Go.
    if (!wasDone) {
        webauthClosed();
    }
    if (gAuth == self) gAuth = nil;
}

@end

void o3StartWebAuth(const char *loginURL) {
    NSString *urlStr = [NSString stringWithUTF8String:loginURL];
    dispatch_async(dispatch_get_main_queue(), ^{
        NSLog(@"[webauth] o3StartWebAuth (main thread) url=%@", urlStr);

        // Supersede any window still open from a previous attempt so reopening
        // always yields a fresh, working window. Marking done first stops its
        // windowWillClose from reporting a cancellation.
        if (gAuth != nil) {
            NSLog(@"[webauth] superseding a prior window");
            gAuth.done = YES;
            [gAuth.timer invalidate];
            gAuth.timer = nil;
            [gAuth.window close];
            gAuth = nil;
        }

        O3WebAuth *auth = [[O3WebAuth alloc] init];
        gAuth = auth;

        WKWebViewConfiguration *cfg = [[WKWebViewConfiguration alloc] init];
        // Isolate every login in a private, non-persistent data store so no
        // cookies or site data survive between captures. This makes account
        // switching reliable — Browser Login can never silently recapture a
        // prior user's session — and leaves Sign Out with no stale WebView
        // state to clear. The captured cookies are replayed by o3's own HTTP
        // client, independent of this store.
        cfg.websiteDataStore = [WKWebsiteDataStore nonPersistentDataStore];
        // Fallback capture: observe the Authorization header the SPA sends to its
        // backend (the DURABLE credential — e.g. Basic email:token — that survives
        // the short-lived session cookie) plus the logged-in email. OpenObserve's
        // web app issues requests via axios (XMLHttpRequest), so we MUST hook both
        // fetch AND XMLHttpRequest.setRequestHeader — hooking fetch alone captured
        // nothing on real instances, leaving only the expiring session cookie.
        NSString *js =
          @"(function(){try{"
          @"function post(a){try{a=String(a||'');if(a){window.webkit.messageHandlers.o3.postMessage({authorization:a});}}catch(e){}}"
          @"try{var of=window.fetch;window.fetch=function(){try{"
          @"var h=arguments[1]&&arguments[1].headers;"
          @"if(h){var a=h['Authorization']||h['authorization']||(h.get&&(h.get('Authorization')||h.get('authorization')));if(a)post(a);}"
          @"}catch(e){}return of.apply(this,arguments);};}catch(e){}"
          @"try{var XS=XMLHttpRequest.prototype.setRequestHeader;"
          @"XMLHttpRequest.prototype.setRequestHeader=function(k,v){try{"
          @"if(k&&String(k).toLowerCase()==='authorization')post(v);"
          @"}catch(e){}return XS.apply(this,arguments);};}catch(e){}"
          @"try{var raw=localStorage.getItem('user_info')||localStorage.getItem('userInfo');"
          @"if(raw){var j=JSON.parse(raw);var em=j.email||(j.data&&j.data.email);"
          @"if(em){window.webkit.messageHandlers.o3.postMessage({email:em});}}}catch(e){}"
          @"}catch(e){}})();";
        WKUserScript *script = [[WKUserScript alloc] initWithSource:js
            injectionTime:WKUserScriptInjectionTimeAtDocumentEnd forMainFrameOnly:NO];
        [cfg.userContentController addUserScript:script];
        [cfg.userContentController addScriptMessageHandler:auth name:@"o3"];

        NSRect frame = NSMakeRect(0, 0, 480, 640);
        WKWebView *wv = [[WKWebView alloc] initWithFrame:frame configuration:cfg];
        wv.navigationDelegate = auth;
        auth.webView = wv;

        NSWindow *win = [[NSWindow alloc] initWithContentRect:frame
            styleMask:(NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskMiniaturizable|NSWindowStyleMaskResizable)
            backing:NSBackingStoreBuffered defer:NO];
        win.title = @"Sign in to OpenObserve";
        [win setMovable:YES];
        [win setMovableByWindowBackground:NO];
        win.contentView = wv;
        win.delegate = auth;
        win.releasedWhenClosed = NO;
        [win setLevel:NSNormalWindowLevel];
        auth.window = win;
        [win center];
        [win makeKeyAndOrderFront:nil];
        [NSApp activateIgnoringOtherApps:YES];

        NSURL *u = [NSURL URLWithString:urlStr];
        if (u != nil) {
            [wv loadRequest:[NSURLRequest requestWithURL:u]];
        }
        NSLog(@"[webauth] window shown movable=%d titled=%d",
              (int)win.isMovable, (int)((win.styleMask & NSWindowStyleMaskTitled) != 0));

        auth.timer = [NSTimer scheduledTimerWithTimeInterval:0.7 repeats:YES
            block:^(NSTimer *t){ [auth probe]; }];
    });
}

void o3FinishWebAuth(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSLog(@"[webauth] o3FinishWebAuth (main thread) hasWindow=%d", gAuth != nil);
        if (gAuth != nil) {
            [gAuth finish];
        }
    });
}
