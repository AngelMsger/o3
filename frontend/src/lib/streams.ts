// Pure case-insensitive substring filter for the stream picker. A blank query
// (after trimming) returns the list unchanged.
export function filterStreams<T extends { name: string }>(streams: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return streams;
  return streams.filter((s) => s.name.toLowerCase().includes(q));
}
