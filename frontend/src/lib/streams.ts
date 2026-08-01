// Pure case-insensitive substring filter for the stream picker. A blank query
// (after trimming) returns the list unchanged.
export function filterStreams<T extends { name: string }>(streams: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return streams;
  return streams.filter((s) => s.name.toLowerCase().includes(q));
}

// pickStream decides which stream to open a freshly loaded stream list on:
// the one the user last selected in this context, when the server still lists
// it, and otherwise the first. Streams come and go server-side, so a remembered
// name that has disappeared must not be restored — it would leave the picker on
// a stream every query then fails against. An empty list yields "" (unseeded).
export function pickStream(streams: { name: string }[], remembered: string | undefined): string {
  if (remembered && streams.some((s) => s.name === remembered)) return remembered;
  return streams[0]?.name ?? '';
}
