// フィード取得。条件付きGET（ETag / If-Modified-Since）をサポート。

export async function fetchFeed(url, options = {}) {
  const { etag, lastModified, userAgent } = options;

  const headers = {
    'User-Agent': userAgent || 'jma-alert-bot/1.0',
    'Accept-Encoding': 'gzip',
  };

  if (etag) headers['If-None-Match'] = etag;
  if (lastModified) headers['If-Modified-Since'] = lastModified;

  const response = await fetch(url, { headers });

  if (response.status === 304) {
    return { status: 304, notModified: true };
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const text = await response.text();

  return {
    status: 200,
    notModified: false,
    body: text,
    etag: response.headers.get('etag') || null,
    lastModified: response.headers.get('last-modified') || null,
  };
}
