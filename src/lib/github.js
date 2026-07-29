// GitHub API連携。JSON を Repository に push。

export async function pushToGitHub(jsonData, options) {
  const { owner, repo, token } = options;

  if (!owner || !repo || !token) {
    throw new Error('GitHub credentials not configured');
  }

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const yearMonth = now.toISOString().slice(0, 7);

  // ファイルパス
  const latestPath = 'latest.json';
  const archivePath = `archive/${yearMonth}/${timestamp}.json`;

  // latest.json を更新
  await pushFile(owner, repo, token, latestPath, jsonData);

  // アーカイブに保存
  await pushFile(owner, repo, token, archivePath, jsonData);

  return { latestPath, archivePath };
}

async function pushFile(owner, repo, token, filePath, content) {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

  // 既存ファイルの情報を取得（更新時の SHA を得るため）
  let sha = null;
  try {
    const getResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (getResponse.ok) {
      const existing = await getResponse.json();
      sha = existing.sha;
    }
  } catch (err) {
    // ファイルが存在しない場合はスキップ
  }

  // ファイルをコミット
  const body = {
    message: `Update ${filePath} - ${new Date().toISOString()}`,
    content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
    branch: 'main',
  };

  if (sha) {
    body.sha = sha;
  }

  const pushResponse = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!pushResponse.ok) {
    const error = await pushResponse.json();
    throw new Error(`GitHub API error: ${error.message}`);
  }

  return pushResponse.json();
}

export class MockGitHub {
  constructor() {
    this.files = new Map();
  }

  async pushToGitHub(jsonData, options) {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const yearMonth = now.toISOString().slice(0, 7);

    const latestPath = 'latest.json';
    const archivePath = `archive/${yearMonth}/${timestamp}.json`;

    this.files.set(latestPath, jsonData);
    this.files.set(archivePath, jsonData);

    return { latestPath, archivePath };
  }

  getFile(path) {
    return this.files.get(path);
  }
}
