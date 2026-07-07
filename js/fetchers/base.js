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
