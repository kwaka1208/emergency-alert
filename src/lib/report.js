// 電文XMLの取得・パース。

export async function fetchReport(url, options = {}) {
  const { userAgent } = options;
  const headers = {
    'User-Agent': userAgent || 'jma-alert-bot/1.0',
  };

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch report ${url}: ${response.status}`);
  }

  return response.text();
}

export function parseReport(reportData) {
  // reportData は parser.parse()の結果の Report要素
  const report = reportData.Report || reportData;
  const head = report.Head || {};

  // 情報内容の抽出
  const information = parseInformation(head);

  return {
    title: head.Title || '',
    reportDateTime: head.ReportDateTime || '',
    targetDateTime: head.TargetDateTime || '',
    infoType: head.InfoType || '発表',
    infoKind: head.InfoKind || '',
    eventID: head.EventID || null,
    serial: head.Serial || null,
    headline: head.Headline?.Text || '',
    information: information,
  };
}

export function parseInformation(head) {
  const information = head.Headline?.Information;
  if (!information) return [];

  // Information が配列でない場合は配列化
  const infoArray = Array.isArray(information) ? information : [information];

  const result = [];

  for (const info of infoArray) {
    const items = info.Item || [];
    const itemArray = Array.isArray(items) ? items : [items];

    for (const item of itemArray) {
      const kinds = item.Kind || [];
      const kindArray = Array.isArray(kinds) ? kinds : [kinds];

      const areas = item.Areas?.Area || [];
      const areaArray = Array.isArray(areas) ? areas : [areas];

      for (const area of areaArray) {
        for (const kind of kindArray) {
          result.push({
            areaName: area.Name || '',
            areaCode: area.Code || '',
            kindName: kind.Name || '',
            kindCode: kind.Code || '',
          });
        }
      }
    }
  }

  return result;
}

export function extractStateKey(info) {
  // 府県予報区コードを基にした状態キー
  return info.areaCode;
}

export function buildStateEntry(info) {
  return {
    name: info.kindName,
    code: info.kindCode,
    areaCode: info.areaCode,
    areaName: info.areaName,
  };
}
