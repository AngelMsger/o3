//go:build darwin

// The ObjC half of installUpdateMenuItem (menu_darwin_inject.go): insert a
// native "Check for Updates…" item into the app menu that Wails builds from
// the AppMenuRole, right after "About o3" — the position macOS users know from
// every Sparkle-carrying app. Definitions live here because a Go file with
// //export directives may only declare C functions in its preamble.
//
// Compiled without ARC (cgo default): the target singleton and the menu item
// are created once and owned for the app's lifetime — the menu retains the
// item, the item retains its target.

#import <Cocoa/Cocoa.h>
#include "_cgo_export.h"

@interface O3UpdateMenuTarget : NSObject
- (void)o3CheckForUpdates:(id)sender;
@end

@implementation O3UpdateMenuTarget
- (void)o3CheckForUpdates:(id)sender {
	o3MenuCheckForUpdates();
}
@end

void o3_install_update_menu_item(void) {
	dispatch_async(dispatch_get_main_queue(), ^{
		NSMenu *main = [NSApp mainMenu];
		if (main == nil || [main numberOfItems] == 0) {
			NSLog(@"o3: no main menu; Check for Updates stays in Settings ▸ About only");
			return;
		}
		NSMenu *appMenu = [[main itemAtIndex:0] submenu];
		if (appMenu == nil || [appMenu numberOfItems] == 0) {
			NSLog(@"o3: no app menu; Check for Updates stays in Settings ▸ About only");
			return;
		}
		O3UpdateMenuTarget *target = [[O3UpdateMenuTarget alloc] init];
		NSMenuItem *item = [[NSMenuItem alloc]
			initWithTitle:@"Check for Updates…"
			       action:@selector(o3CheckForUpdates:)
			keyEquivalent:@""];
		[item setTarget:target];
		// Index 1: directly after "About o3", before the separator the role adds.
		[appMenu insertItem:item atIndex:1];
		NSLog(@"o3: installed 'Check for Updates…' in the app menu");
	});
}
