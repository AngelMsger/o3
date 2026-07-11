#ifndef O3_WEBAUTH_DARWIN_H
#define O3_WEBAUTH_DARWIN_H

// o3StartWebAuth builds the native login window on the main thread and loads
// loginURL. Implemented in webauth_darwin.m; declared here so the cgo Go file
// can call it without pulling the Objective-C implementation into the preamble
// (which would compile it twice and duplicate its symbols).
void o3StartWebAuth(const char *loginURL);

// o3FinishWebAuth closes the active login window from Go once an asynchronous
// authenticated probe has confirmed the captured session. Safe to call from any
// thread (it marshals onto the main thread) and is a no-op when no window is
// open. Declared here for the same double-compile reason as o3StartWebAuth.
void o3FinishWebAuth(void);

#endif
