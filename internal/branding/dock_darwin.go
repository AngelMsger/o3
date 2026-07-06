//go:build darwin

package branding

/*
#cgo darwin CFLAGS: -x objective-c
#cgo darwin LDFLAGS: -framework Cocoa
#import <Cocoa/Cocoa.h>

// o3SetDockIcon copies the PNG bytes into an NSData (synchronously, so the Go
// slice need not outlive this call) and applies the icon on the main thread.
static void o3SetDockIcon(const void *data, int len) {
    NSData *d = [NSData dataWithBytes:data length:len];
    dispatch_async(dispatch_get_main_queue(), ^{
        NSImage *img = [[NSImage alloc] initWithData:d];
        if (img != nil) {
            [NSApplication sharedApplication].applicationIconImage = img;
        }
    });
}

// o3SetAppearance pins the app-wide NSAppearance on the main thread.
// mode: 1 = dark, 2 = light, anything else = nil (follow the OS). Setting it to
// nil is what lets the WKWebView's prefers-color-scheme track the real system
// appearance, so the "System" theme preference can resolve to light.
static void o3SetAppearance(int mode) {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSAppearance *ap = nil;
        if (mode == 1) {
            // NSAppearanceNameDarkAqua is 10.14+; on older systems leave ap nil
            // (follow the OS) rather than fail to compile against the SDK.
            if (@available(macOS 10.14, *)) {
                ap = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
            }
        } else if (mode == 2) {
            ap = [NSAppearance appearanceNamed:NSAppearanceNameAqua];
        }
        [NSApplication sharedApplication].appearance = ap;
    });
}
*/
import "C"

import "unsafe"

// SetDock swaps the running app's Dock icon to the Void (dark) or Signal
// (light) variant. Safe to call from any goroutine — the AppKit mutation is
// marshalled onto the main thread.
func SetDock(dark bool) {
	png := signalPNG
	if dark {
		png = voidPNG
	}
	if len(png) == 0 {
		return
	}
	C.o3SetDockIcon(unsafe.Pointer(&png[0]), C.int(len(png)))
}

// SetAppearance drives the native macOS app appearance from the theme
// preference so the WKWebView's prefers-color-scheme (which powers the "System"
// theme) reports the real OS state, and native chrome matches o3's theme.
// pref: "dark" and "light" pin the appearance; any other value (e.g. "system")
// clears it so the app follows the OS. Safe to call from any goroutine.
func SetAppearance(pref string) {
	var mode C.int
	switch pref {
	case "dark":
		mode = 1
	case "light":
		mode = 2
	default:
		mode = 0
	}
	C.o3SetAppearance(mode)
}
