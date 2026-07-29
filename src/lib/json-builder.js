// 新着エントリをJSON形式に整理。pure function。

export function buildFeedJSON(feedName, entries, metadata = {}) {
  return {
    feed: feedName,
    timestamp: new Date().toISOString(),
    count: entries.length,
    entries: entries.map(normalizeEntry),
    metadata,
  };
}

function normalizeEntry(entry) {
  return {
    id: entry.id || '',
    title: entry.title || '',
    updated: entry.updated || '',
    link: entry.link || '',
    summary: entry.summary || '',
    content: entry.content || '',
  };
}

export function buildBatchJSON(feedResults) {
  return {
    timestamp: new Date().toISOString(),
    feeds: feedResults,
    summary: {
      totalFeeds: feedResults.length,
      totalNewEntries: feedResults.reduce((sum, f) => sum + f.count, 0),
    },
  };
}
