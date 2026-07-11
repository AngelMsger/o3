// Time-range model for the Logs query window. Kept pure (no React, no Date.now
// baked in) so the relative/absolute math and labels are unit-tested directly.
//
// This is the single source of truth the query layer reads: the picker commits a
// TimeRange, and rangeToMicros derives the actual [start,end] the backend sees.
// Previously the picker only changed a display label while queries always used a
// fixed relative window — quick ranges and absolute times were ignored.

export type TimeRange =
  | { kind: 'relative'; amount: number; unit: string } // unit ∈ s|m|h|d|w
  | { kind: 'absolute'; fromMs: number; toMs: number }; // epoch millis

const UNIT_MICROS: Record<string, number> = {
  s: 1e6, m: 60e6, h: 3600e6, d: 86400e6, w: 604800e6,
};

const UNIT_LABEL: Record<string, string> = {
  s: 'Second', m: 'Minute', h: 'Hour', d: 'Day', w: 'Week',
};

// The app renders timestamps in Asia/Shanghai (UTC+8, no DST), so absolute
// wall-clock input is interpreted in that zone for a stable, testable mapping.
const SHANGHAI_OFFSET_MS = 8 * 3600 * 1000;

// relativeRange builds a relative range, clamping a bad amount/unit to sane
// defaults (15 minutes) so a malformed picker input never yields NaN micros.
export function relativeRange(amount: number, unit: string): TimeRange {
  const a = Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 15;
  const u = UNIT_MICROS[unit] ? unit : 'm';
  return { kind: 'relative', amount: a, unit: u };
}

// rangeToMicros converts a range into the microsecond [start,end] the backend
// query API expects. `nowMs` is injectable for deterministic tests; relative
// ranges resolve against it, absolute ranges ignore it.
export function rangeToMicros(
  r: TimeRange,
  nowMs: number = Date.now(),
): { startMicros: number; endMicros: number } {
  if (r.kind === 'absolute') {
    return { startMicros: Math.round(r.fromMs * 1000), endMicros: Math.round(r.toMs * 1000) };
  }
  const now = nowMs * 1000;
  const span = r.amount * (UNIT_MICROS[r.unit] ?? 60e6);
  return { startMicros: Math.round(now - span), endMicros: Math.round(now) };
}

// rangeLabel renders the range for the time-range button.
export function rangeLabel(r: TimeRange): string {
  if (r.kind === 'absolute') {
    return `${fmtAbsMs(r.fromMs)} — ${fmtAbsMs(r.toMs)}`;
  }
  const unit = UNIT_LABEL[r.unit] ?? 'Minute';
  return `Past ${r.amount} ${unit}${r.amount === 1 ? '' : 's'}`;
}

// parseAbsolute parses two "YYYY-MM-DD HH:mm[:ss]" wall-clock strings (Asia/
// Shanghai) into an absolute range, or null when either is unparseable or the
// window is non-positive (to must be strictly after from).
export function parseAbsolute(from: string, to: string): { fromMs: number; toMs: number } | null {
  const f = parseWallClock(from);
  const t = parseWallClock(to);
  if (f === null || t === null || t <= f) return null;
  return { fromMs: f, toMs: t };
}

const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

function parseWallClock(s: string): number | null {
  const m = s.trim().match(WALL_RE);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, se ? +se : 0);
  if (Number.isNaN(utc)) return null;
  return utc - SHANGHAI_OFFSET_MS;
}

function fmtAbsMs(ms: number): string {
  const d = new Date(ms + SHANGHAI_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
