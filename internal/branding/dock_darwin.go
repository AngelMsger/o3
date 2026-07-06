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
