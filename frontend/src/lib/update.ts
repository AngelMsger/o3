// Pure presentation logic for the update check. Kept free of Wails imports so it
// is unit-tested like lib/ecosystem.ts.

// UpdateResult mirrors update.Result on the Go side.
export interface UpdateResult {
  checked: boolean;
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseName: string;
  notes: string;
  publishedAt: string;
  releaseURL: string;
  downloadURL: string;
  assetName: string;
  os: string;
  arch: string;
}

// AppInfo mirrors main.AppInfo on the Go side.
export interface AppInfo {
  version: string;
  os: string;
  arch: string;
  wails: string;
  isDev: boolean;
  // "native" when an OS framework (Sparkle/WinSparkle) owns the update flow —
  // its own dialogs, download, install, relaunch. "custom" everywhere else
  // (Linux, dev builds): the check-only flow rendered by UpdateSheet.
  updateMode: string;
}

// nativeUpdates reports whether the running build delegates updates to an OS
// framework. While AppInfo is still loading (null) it answers false, which errs
// toward mounting the custom UI — harmless, since a native-mode backend never
// emits the events that would open it.
export function nativeUpdates(info: AppInfo | null): boolean {
  return info?.updateMode === 'native';
}

// CheckState drives both the About button and the update sheet, so the two can
// never disagree about what the last check found.
//
//   idle      — no check has run yet
//   checking  — a check is in flight
//   dev       — a local build; the check is skipped entirely
//   current   — checked, and this is the newest release (or none is published)
//   available — checked, and a newer release exists
//   error     — the check failed (offline, rate-limited, GitHub down)
export type CheckState = 'idle' | 'checking' | 'dev' | 'current' | 'available' | 'error';

export function checkState(
  result: UpdateResult | null,
  busy: boolean,
  error: string,
): CheckState {
  if (busy) return 'checking';
  if (error) return 'error';
  if (!result) return 'idle';
  // A dev build reports checked=false: it never contacts GitHub.
  if (!result.checked) return 'dev';
  return result.updateAvailable ? 'available' : 'current';
}

const OS_LABELS: Record<string, string> = {
  darwin: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
};

export function osLabel(os: string): string {
  return OS_LABELS[os] ?? os;
}

// platformLine is the About card's build line: "v1.2.0 · Wails v2.12.0 · macOS arm64".
export function platformLine(info: AppInfo | null): string {
  if (!info) return '';
  const version = info.isDev ? 'dev build' : `v${info.version}`;
  return `${version} · Wails ${info.wails} · ${osLabel(info.os)} ${info.arch}`;
}

// versionLine is the sheet's subtitle: "o3 1.3.0 is available — you have 1.2.0".
export function versionLine(r: UpdateResult): string {
  return `o3 ${r.latestVersion} is available — you have ${r.currentVersion}`;
}

// assetLabel names the primary action. When the release shipped no artifact for
// this platform the backend hands back the release page instead, and the button
// has to say so rather than promise a download that isn't there.
export function assetLabel(r: UpdateResult): string {
  if (!r.assetName) return 'Open Release Page';
  return `Download For ${osLabel(r.os)}`;
}

// publishedLabel renders the release date. An unparseable or missing date yields
// "" so the caller can omit the line entirely.
export function publishedLabel(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
