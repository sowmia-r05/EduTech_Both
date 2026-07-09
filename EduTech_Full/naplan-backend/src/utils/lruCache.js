// src/utils/lruCache.js
//
// Tiny dependency-free LRU cache. Drop-in replacement for a `new Map()` that is
// being used as a cache: supports get / set / has / delete / clear / size.
//
// WHY: a plain Map used as a module-level cache never evicts — it grows for the
// life of the Node process and eventually OOM-kills a small instance. This caps
// the entry count (max) and, optionally, how long an entry stays fresh (ttlMs).
//
// Recency: Map preserves insertion order. get() re-inserts the key so it becomes
// the "newest"; set() evicts from the front (oldest) once size exceeds max.

class LRUCache {
  /**
   * @param {object}  opts
   * @param {number}  opts.max    Max number of entries to keep (default 500).
   * @param {number}  opts.ttlMs  Entry lifetime in ms. 0 = no expiry (default 0).
   */
  constructor({ max = 500, ttlMs = 0 } = {}) {
    this.max = Math.max(1, max);
    this.ttlMs = Math.max(0, ttlMs);
    this.map = new Map(); // key -> { value, expires }
  }

  _fresh(entry) {
    if (!entry) return false;
    if (this.ttlMs && Date.now() > entry.expires) return false;
    return true;
  }

  get(key) {
    const entry = this.map.get(key);
    if (!this._fresh(entry)) {
      if (entry) this.map.delete(key); // drop expired
      return undefined;
    }
    // Mark as most-recently-used: delete + re-set moves it to the end.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  has(key) {
    const entry = this.map.get(key);
    if (!this._fresh(entry)) {
      if (entry) this.map.delete(key);
      return false;
    }
    return true;
  }

  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, {
      value,
      expires: this.ttlMs ? Date.now() + this.ttlMs : 0,
    });
    // Evict oldest entries while over capacity.
    while (this.map.size > this.max) {
      const oldestKey = this.map.keys().next().value;
      this.map.delete(oldestKey);
    }
    return this;
  }

  delete(key) {
    return this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }

  get size() {
    return this.map.size;
  }
}

module.exports = { LRUCache };