// Parse a value into a valid Date, or return `fallback` when it can't be.
// Guards against `chrome.storage.local` losing Date objects (they come back as
// `{}`) and against any other unparseable value producing an `Invalid Date`.
function toValidDate(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? fallback : d;
}

export class Transaction {
  constructor(data) {
    this.source = data.source; // "DMarket", "CSFloat"...
    this.type = data.type; // "BUY" or "SELL"
    this.tx_id = data.tx_id; // Unique ID
    this.asset_id = data.asset_id; // Item Asset ID
    this.item_name = data.item_name; // Full Name

    this.price = parseFloat(data.price || 0);
    this.currency = data.currency; // "USD", "CNY"...

    this.created_at = toValidDate(data.created_at, new Date());
    this.verified_at = toValidDate(data.verified_at, null);

    // Metadata
    this.float_val =
      data.float_val !== undefined ? parseFloat(data.float_val) : 0;
    this.phase = data.phase || "";
    this.pattern = data.pattern !== undefined ? parseInt(data.pattern) : -1;
  }
}

export class BaseFetcher {
  constructor(name) {
    this.name = name;

    // --- Incremental sync ---------------------------------------------------
    // When `sinceCutoff` is a Date, an incremental sync is running: this source
    // only needs transactions at/after the cutoff, because everything older is
    // already stored locally and gets merged back in by the orchestrator. Every
    // marketplace API here returns history newest-first, so a fetcher can stop
    // paginating (via `reachedCutoff`) once a whole page falls before the
    // cutoff. `null` = fetch the complete history (full sync).
    this.sinceCutoff = null;

    // Whether this source pages STRICTLY newest-first (all current ones do), so
    // early-stopping on the cutoff is safe. A differently-ordered API must set
    // this to false so the orchestrator always fetches it in full.
    this.supportsIncremental = true;
  }

  // Must return true if 200 OK
  async checkSession() {
    return false;
  }

  async getSales(since) {
    return [];
  }
  async getBuys(since) {
    return [];
  }

  // Some fetchers memoize a run's full history on the instance (to share it
  // between getSales/getBuys). That cache must be dropped at the start of every
  // sync, otherwise a re-sync would replay stale data and ignore `sinceCutoff`.
  // Overridden by those fetchers; a no-op for the rest.
  resetCache() {}

  // Effective time of a transaction: the newest of created/verified. History is
  // sorted by (roughly) this, so it's what we compare against the cutoff.
  txTime(t) {
    const c = t.created_at instanceof Date ? t.created_at.getTime() : 0;
    const v = t.verified_at instanceof Date ? t.verified_at.getTime() : 0;
    return Math.max(c, v);
  }

  // True once we've paged back far enough to stop: every transaction on the
  // just-built page precedes the cutoff. Pages are newest-first, so if even the
  // oldest row here is before the cutoff, all remaining pages are too.
  // Returns false when no incremental sync is active (so full syncs never stop
  // early) or the page is empty (let the caller's own end-of-data check handle
  // it). A fetcher that never calls this simply returns its full history, which
  // the merge still turns into a correct (just un-optimized) result.
  reachedCutoff(pageTxns) {
    if (!this.sinceCutoff || !pageTxns || pageTxns.length === 0) return false;
    const cutoff = this.sinceCutoff.getTime();
    for (const t of pageTxns) {
      if (this.txTime(t) >= cutoff) return false; // still inside the window
    }
    return true;
  }

  async fetchWithAuth(url, options = {}) {
    try {
      const defaults = { method: "GET", credentials: "include" };
      const resp = await fetch(url, { ...defaults, ...options });
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      return await resp.json();
    } catch (e) {
      console.error(`[${this.name}] Fetch Error:`, e);
      throw e;
    }
  }

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async getBalance() {
    return 0;
  }
}
