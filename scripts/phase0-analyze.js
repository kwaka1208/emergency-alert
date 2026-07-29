import fs from 'fs/promises';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' });

const FEEDS = [
  { name: 'extra', path: 'test/fixtures/extra_l.xml' },
  { name: 'eqvol', path: 'test/fixtures/eqvol_l.xml' },
  { name: 'other', path: 'test/fixtures/other_l.xml' },
  { name: 'regular', path: 'test/fixtures/regular_l.xml' },
];

async function analyze() {
  const results = {};

  for (const feed of FEEDS) {
    console.log(`\nAnalyzing ${feed.name}...`);
    const xml = await fs.readFile(feed.path, 'utf-8');
    const doc = parser.parse(xml);

    // entry を必ず配列に正規化
    let entries = doc.feed?.entry ?? [];
    if (!Array.isArray(entries)) {
      entries = [entries];
    }

    const titleMap = new Map();
    const timeByHour = new Map();

    for (const entry of entries) {
      const title = entry.title || '';
      titleMap.set(title, (titleMap.get(title) ?? 0) + 1);

      // entry.updated は UTC (Z)、日本時間に変換
      const entryTime = new Date(entry.updated);
      const jstHour = new Date(entryTime.getTime() + 9 * 60 * 60 * 1000)
        .toISOString().split('T')[0]; // YYYY-MM-DD
      timeByHour.set(jstHour, (timeByHour.get(jstHour) ?? 0) + 1);
    }

    results[feed.name] = {
      totalEntries: entries.length,
      titleFrequency: Object.fromEntries(titleMap.entries()),
      hourlyDistribution: Object.fromEntries(timeByHour.entries()),
    };

    console.log(`  Total entries: ${entries.length}`);
    console.log(`  Unique titles: ${titleMap.size}`);
  }

  // 全情報名を集計
  const allTitles = new Set();
  for (const feedResult of Object.values(results)) {
    Object.keys(feedResult.titleFrequency).forEach(t => allTitles.add(t));
  }

  // レポート生成
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalFeeds: FEEDS.length,
      feeds: {},
      allTitles: Array.from(allTitles).sort(),
    },
    details: results,
  };

  // フィード別サマリー
  for (const [feedName, feedResult] of Object.entries(results)) {
    const counts = Object.values(feedResult.titleFrequency);
    const hours = Object.values(feedResult.hourlyDistribution);

    report.summary.feeds[feedName] = {
      totalEntries: feedResult.totalEntries,
      uniqueTitles: Object.keys(feedResult.titleFrequency).length,
      topTitles: Object.entries(feedResult.titleFrequency)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([title, count]) => ({ title, count })),
      dailyDistribution: {
        min: Math.min(...hours),
        max: Math.max(...hours),
        average: (counts.reduce((a, b) => a + b, 0) / hours.length).toFixed(1),
      },
    };
  }

  // ファイルに保存
  await fs.writeFile(
    'test/fixtures/PHASE0_REPORT.json',
    JSON.stringify(report, null, 2)
  );

  // コンソール出力
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 0 ANALYSIS REPORT');
  console.log('='.repeat(60));

  for (const [feedName, summary] of Object.entries(report.summary.feeds)) {
    console.log(`\n【${feedName.toUpperCase()}】`);
    console.log(`  Total entries: ${summary.totalEntries}`);
    console.log(`  Unique info titles: ${summary.uniqueTitles}`);
    console.log(`  Daily distribution: min=${summary.dailyDistribution.min}, max=${summary.dailyDistribution.max}, avg=${summary.dailyDistribution.average}`);
    console.log(`  Top 10 titles:`);
    for (const { title, count } of summary.topTitles) {
      console.log(`    - ${title}: ${count}`);
    }
  }

  console.log('\n【ALL INFORMATION TITLES】');
  for (const title of report.summary.allTitles) {
    console.log(`  - ${title}`);
  }

  console.log('\n✅ Report saved to test/fixtures/PHASE0_REPORT.json');
}

analyze().catch(console.error);
