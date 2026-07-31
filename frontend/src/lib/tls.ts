// TLS-related decisions for the connection UI, kept pure so they can be tested
// without a DOM (matching the repo's pure-logic test style).
//
// o3 connects through the shared CLI client, which uses the system trust store
// and has no way to skip certificate verification — the Setup Wizard used to
// carry a "Trust Self-Signed Certificate" toggle that was wired to nothing at
// all. The toggle is gone; these helpers back the note that replaced it.

// usesTLS reports whether a context URL will be reached over TLS, so the
// certificate note is shown only when it can possibly apply — never for a plain
// http://localhost instance. A scheme-less URL counts as TLS because
// normalizeURL (app.go) prepends https:// before the client ever sees it.
export function usesTLS(url: string): boolean {
  const s = url.trim().toLowerCase();
  if (s === '') return false;
  if (s.startsWith('https://')) return true;
  if (s.includes('://')) return false;
  return true;
}
