// Firestore操作。フィード状態管理と重複排除。

export class FeedStateStore {
  constructor(db) {
    this.db = db;
  }

  async getFeedState(feedName) {
    const doc = await this.db
      .collection('jmaFeedState')
      .doc(feedName)
      .get();
    return doc.data() || {};
  }

  async saveFeedState(feedName, etag, lastModified) {
    await this.db
      .collection('jmaFeedState')
      .doc(feedName)
      .set({
        etag,
        lastModified,
        updatedAt: new Date(),
      }, { merge: true });
  }

  async isEntryProcessed(entryHash) {
    try {
      await this.db
        .collection('jmaSeenEntries')
        .doc(entryHash)
        .create({ createdAt: new Date(), expireAt: this.getExpireTime() });
      return false; // 新規エントリ
    } catch (err) {
      if (err.code === 6) { // ALREADY_EXISTS
        return true; // 既に処理済み
      }
      throw err;
    }
  }

  getExpireTime() {
    const now = new Date();
    now.setHours(now.getHours() + 48);
    return now;
  }
}

export class MockFeedStateStore {
  constructor() {
    this.states = new Map();
    this.seenEntries = new Set();
  }

  async getFeedState(feedName) {
    return this.states.get(feedName) || {};
  }

  async saveFeedState(feedName, etag, lastModified) {
    this.states.set(feedName, { etag, lastModified, updatedAt: new Date() });
  }

  async isEntryProcessed(entryHash) {
    if (this.seenEntries.has(entryHash)) {
      return true;
    }
    this.seenEntries.add(entryHash);
    return false;
  }

  getExpireTime() {
    const now = new Date();
    now.setHours(now.getHours() + 48);
    return now;
  }
}
