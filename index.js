import functions from '@google-cloud/functions-framework';
import { Firestore } from '@google-cloud/firestore';
import { XMLParser } from 'fast-xml-parser';
import crypto from 'node:crypto';

const db = new Firestore();
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' });

// 気象庁が提示している連絡先付きUAを名乗っておくと、問い合わせが来たときに話が早い
const UA = process.env.USER_AGENT ?? 'jma-alert-bot/1.0 (+https://example.com/contact)';

// 高頻度フィード（毎分更新・直近10分ぶんを掲載）
// regular=定時（天気概況など。通知用途ではノイズが多いので既定でオフ）
const FEEDS = [
  { name: 'extra', url: 'https://www.data.jma.go.jp/developer/xml/feed/extra.xml' },
  { name: 'eqvol', url: 'https://www.data.jma.go.jp/developer/xml/feed/eqvol.xml' },
  { name: 'other', url: 'https://www.data.jma.go.jp/developer/xml/feed/other.xml' },
];

// 通知したい情報名（entry の title と前方一致で判定）
// ※2026-05-29の体系変更で「レベル3大雨警報」「レベル4土砂災害危険警報」等に名称が変わっている
const TITLE_ALLOW = (process.env.TITLE_ALLOW ??
  '気象警報・注意報,土砂災害,危険警報,特別警報,気象防災速報,震源・震度に関する情報,津波,噴火'
).split(',').map(s => s.trim()).filter(Boolean);

// 対象地域（府県予報区名・都道府県名など）。空なら地域フィルタなし
const TARGET_AREAS = (process.env.TARGET_AREAS ?? '')
  .split(',').map(s => s.trim()).filter(Boolean);

const SEEN_TTL_HOURS = 48;

functions.http('pollJmaFeed', async (req, res) => {
  const results = await Promise.allSettled(FEEDS.map(pollFeed));
  const summary = results.map((r, i) => ({
    feed: FEEDS[i].name,
    ...(r.status === 'fulfilled' ? r.value : { error: String(r.reason) }),
  }));
  const failed = results.some(r => r.status === 'rejected');
  // 失敗時は5xxを返す → Cloud Scheduler がリトライしてくれる
  res.status(failed ? 500 : 200).json({ summary });
});

async function pollFeed(feed) {
  const stateRef = db.collection('jmaFeedState').doc(feed.name);
  const state = (await stateRef.get()).data() ?? {};

  const headers = { 'User-Agent': UA, 'Accept-Encoding': 'gzip' };
  if (state.etag) headers['If-None-Match'] = state.etag;
  if (state.lastModified) headers['If-Modified-Since'] = state.lastModified;

  const resp = await fetch(feed.url, { headers });

  // 更新なし。1日10GB制限を守るうえで、これが効くかどうかが一番効く
  if (resp.status === 304) return { status: 304, processed: 0 };
  if (!resp.ok) throw new Error(`${feed.name}: HTTP ${resp.status}`);

  const xml = await resp.text();
  const entries = toArray(parser.parse(xml)?.feed?.entry);

  // 古い順に処理しておくと、通知の並びが実際の発表順になる
  entries.sort((a, b) => String(a.updated).localeCompare(String(b.updated)));

  let processed = 0;
  for (const entry of entries) {
    if (await handleEntry(feed, entry)) processed++;
  }

  // 全件処理しきってからETagを保存する。
  // 先に保存すると、処理中に落ちたときに次回304で取りこぼす
  await stateRef.set({
    etag: resp.headers.get('etag') ?? null,
    lastModified: resp.headers.get('last-modified') ?? null,
    checkedAt: new Date().toISOString(),
  });

  return { status: 200, processed, entries: entries.length };
}

async function handleEntry(feed, entry) {
  const url = entry.id;               // entry の id は電文XMLのURLそのもの
  const title = String(entry.title ?? '');

  if (!TITLE_ALLOW.some(t => title.includes(t))) return false;

  // 重複排除。create() は既存ドキュメントがあると失敗するので、
  // Scheduler のリトライや Pub/Sub の at-least-once に対してそのまま冪等になる
  const seenRef = db.collection('jmaSeenEntries').doc(hash(url));
  try {
    await seenRef.create({
      url, title, feed: feed.name, updated: entry.updated,
      expireAt: new Date(Date.now() + SEEN_TTL_HOURS * 3600_000), // TTLポリシーで自動削除
    });
  } catch (e) {
    if (e.code === 6) return false;   // ALREADY_EXISTS = 処理済み
    throw e;
  }

  const report = await fetchReport(url);
  if (!report) return false;

  if (report.infoType === '取消') {
    await notify(`🟢 【取消】${title}\n${report.headline || ''}\n${url}`);
    return true;
  }

  if (TARGET_AREAS.length && !matchesTargetArea(report)) return false;

  await notify(
    `⚠️ ${title}（${report.infoType}）\n` +
    `${report.reportDateTime}\n` +
    `${report.headline || report.text || ''}\n` +
    (report.areas.length ? `対象: ${report.areas.join('、')}\n` : '') +
    url
  );
  return true;
}

async function fetchReport(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip' } });
  if (!resp.ok) throw new Error(`report fetch failed: ${resp.status} ${url}`);
  const xml = await resp.text();
  const head = parser.parse(xml)?.Report?.Head ?? {};

  // Headline 配下の Area/Name と、地震電文の Pref/Name を拾う。
  // 厳密にやるなら Area/Code（府県予報区コード等）で突き合わせるべきだが、
  // まずは名称ベースで十分動く
  const areas = [...new Set([
    ...collect(head?.Headline?.Information, 'Name'),
    ...(xml.match(/<Name>([^<]+)<\/Name>/g) ?? []).map(m => m.slice(6, -7)),
  ])];

  return {
    infoType: head.InfoType ?? '発表',
    reportDateTime: head.ReportDateTime ?? '',
    headline: typeof head?.Headline?.Text === 'string' ? head.Headline.Text : '',
    text: typeof head?.Text === 'string' ? head.Text : '',
    areas,
    raw: xml,
  };
}

function matchesTargetArea(report) {
  return TARGET_AREAS.some(a => report.areas.some(n => n.includes(a)) || report.raw.includes(a));
}

async function notify(text) {
  const hook = process.env.SLACK_WEBHOOK_URL;
  if (!hook) { console.log('[notify]', text); return; }
  const r = await fetch(hook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) throw new Error(`notify failed: ${r.status}`);
}

// --- utils ---
const toArray = v => (v == null ? [] : Array.isArray(v) ? v : [v]);
const hash = s => crypto.createHash('sha1').update(s).digest('hex');

function collect(node, key, out = []) {
  if (node == null || typeof node !== 'object') return out;
  for (const [k, v] of Object.entries(node)) {
    if (k === key && typeof v === 'string') out.push(v);
    else if (typeof v === 'object') toArray(v).forEach(c => collect(c, key, out));
  }
  return out;
}
