// Atomフィードのパース。pure function。XMLParser は呼び出し側で準備する。

export function normalizeEntries(entries) {
  if (!entries) return [];
  if (!Array.isArray(entries)) return [entries];
  return entries;
}

export function sortEntriesByTime(entries) {
  return [...entries].sort((a, b) => {
    const timeA = new Date(a.updated).getTime();
    const timeB = new Date(b.updated).getTime();
    return timeA - timeB;
  });
}

export function parseAtomFeed(doc) {
  const feed = doc.feed || {};
  const entries = normalizeEntries(feed.entry);

  return {
    id: feed.id || '',
    updated: feed.updated || '',
    title: feed.title || '',
    entries: sortEntriesByTime(entries),
  };
}
